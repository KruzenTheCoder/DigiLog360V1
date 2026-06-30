#!/usr/bin/env node
/**
 * Backfill legacy occurrence images into Supabase Storage and rewrite
 * `public.occurrence_images.storage_path` to the real bucket path.
 *
 * Supports two legacy source strategies:
 * - varbinary/image bytes stored directly in Azure SQL
 * - external blob URLs stored in Azure SQL
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-occurrence-images.mjs --inspect
 *   node --env-file=.env scripts/backfill-occurrence-images.mjs
 *   node --env-file=.env scripts/backfill-occurrence-images.mjs --dry
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { BlobServiceClient } from '@azure/storage-blob';
import mssql from 'mssql';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

const args = new Set(process.argv.slice(2));
const argList = process.argv.slice(2);
const INSPECT = args.has('--inspect');
const DRY = args.has('--dry');
const FIND_STORAGE_META = args.has('--find-storage-meta');
const FIND_STORAGE_VALUES = args.has('--find-storage-values');
const LIMIT_ARG = argList.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Math.max(1, Number(LIMIT_ARG.split('=')[1]) || 0) : null;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = 'occurrence-images';
const ORG_SLUG = process.env.LEGACY_ORG_SLUG || 'pmi';
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const LEGACY_BLOB_CONTAINER = process.env.LEGACY_BLOB_CONTAINER || 'occurrence-images';

const LEGACY_DB = {
  server: process.env.LEGACY_AZURE_SERVER || 'occurrence.database.windows.net',
  database: process.env.LEGACY_AZURE_DB || 'occurrencedb2',
  user: process.env.LEGACY_AZURE_USER || 'superuser',
  password: process.env.LEGACY_AZURE_PASSWORD || 'Admin@123!',
  options: { encrypt: true, trustServerCertificate: false, useUTC: true },
  pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 60000,
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const legacyContainerClient = AZURE_STORAGE_CONNECTION_STRING
  ? BlobServiceClient
      .fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)
      .getContainerClient(LEGACY_BLOB_CONTAINER)
  : null;

const BINARY_CANDIDATES = ['ImageData', 'Image', 'Photo', 'BlobData', 'FileData', 'Data', 'Content'];
const BASE64_CANDIDATES = ['ImageBase64', 'BlobBase64', 'Base64Data', 'Base64', 'DataBase64'];
const URL_CANDIDATES = ['BlobUrl', 'Url', 'FileUrl', 'ImageUrl'];
const NAME_CANDIDATES = ['BlobName', 'FileName', 'Name'];
const CAPTION_CANDIDATES = ['Caption', 'Description'];
const CAPTURED_AT_CANDIDATES = ['CapturedAt', 'CreatedAt', 'UploadedAt'];

function pickColumn(cols, candidates, required = false) {
  const found = candidates.find((name) => cols.includes(name)) ?? null;
  if (required && !found) {
    throw new Error(`Missing required legacy column. Tried: ${candidates.join(', ')}`);
  }
  return found;
}

function q(name) {
  return `[${String(name).replace(/]/g, ']]')}]`;
}

function sanitizeSegment(value, fallback) {
  const clean = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return clean || fallback;
}

function decodeBase64(input) {
  const cleaned = String(input || '').trim().replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(cleaned, 'base64');
}

function guessExt(nameOrUrl, contentType) {
  const fromName = path.extname(String(nameOrUrl || '')).toLowerCase().replace(/^\./, '');
  if (fromName) return fromName === 'jpeg' ? 'jpg' : fromName;
  const type = String(contentType || '').toLowerCase();
  if (type.includes('jpeg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  return 'jpg';
}

function guessContentType(ext) {
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'jpg':
    case 'jpeg':
    default: return 'image/jpeg';
  }
}

function stableObjectName(sourceName, fallbackSeed, ext) {
  const base = sourceName ? path.basename(String(sourceName)) : '';
  if (base) return sanitizeSegment(base, `${fallbackSeed}.${ext}`);
  return `${fallbackSeed}.${ext}`;
}

function rowKey(row, nameCol, urlCol) {
  return [row[nameCol], row[urlCol]].filter(Boolean).join(' | ');
}

function stripQuery(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url));
    u.search = '';
    return u.toString();
  } catch {
    return String(url).split('?')[0];
  }
}

async function loadSupabaseImageRows() {
  const rows = [];
  let from = 0;
  const batchSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('occurrence_images')
      .select('id, occurrence_id, ob_number, storage_path, caption, captured_at')
      .order('id', { ascending: true })
      .range(from, from + batchSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }
  return rows;
}

async function objectExists(storagePath) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 60);
  if (error) return false;
  return !!data?.signedUrl;
}

async function main() {
  const pool = await mssql.connect(LEGACY_DB);
  try {
    const colsRes = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'OccurrenceImages'
      ORDER BY ORDINAL_POSITION
    `);
    const cols = colsRes.recordset.map((row) => row.COLUMN_NAME);
    const types = Object.fromEntries(colsRes.recordset.map((row) => [row.COLUMN_NAME, row.DATA_TYPE]));

    const obCol = pickColumn(cols, ['OccurrenceNumber'], true);
    const binaryCol = pickColumn(cols, BINARY_CANDIDATES);
    const base64Col = pickColumn(cols, BASE64_CANDIDATES);
    const urlCol = pickColumn(cols, URL_CANDIDATES);
    const nameCol = pickColumn(cols, NAME_CANDIDATES);
    const captionCol = pickColumn(cols, CAPTION_CANDIDATES);
    const capturedAtCol = pickColumn(cols, CAPTURED_AT_CANDIDATES);

    if (FIND_STORAGE_META) {
      const metaRes = await pool.request().query(`
        SELECT t.name AS table_name, c.name AS column_name
        FROM sys.tables t
        JOIN sys.columns c ON c.object_id = t.object_id
        WHERE c.name LIKE '%blob%'
           OR c.name LIKE '%storage%'
           OR c.name LIKE '%sas%'
           OR c.name LIKE '%account%'
           OR c.name LIKE '%container%'
        ORDER BY t.name, c.column_id
      `);
      console.log(JSON.stringify({ matches: metaRes.recordset }, null, 2));
      return;
    }

    if (FIND_STORAGE_VALUES) {
      const textColsRes = await pool.request().query(`
        SELECT t.name AS table_name, c.name AS column_name, ty.name AS type_name
        FROM sys.tables t
        JOIN sys.columns c ON c.object_id = t.object_id
        JOIN sys.types ty ON ty.user_type_id = c.user_type_id
        WHERE ty.name IN ('varchar', 'nvarchar', 'text', 'ntext')
        ORDER BY t.name, c.column_id
      `);
      const terms = ['blob.core.windows.net', 'digilog330v3', 'accountkey=', 'defaultendpointsprotocol='];
      const matches = [];
      for (const col of textColsRes.recordset) {
        for (const term of terms) {
          const req = pool.request();
          req.input('term', mssql.NVarChar, `%${term}%`);
          const res = await req.query(`
            SELECT TOP 1 ${q(col.column_name)} AS value
            FROM dbo.${q(col.table_name)}
            WHERE CAST(${q(col.column_name)} AS nvarchar(max)) LIKE @term
          `);
          if (res.recordset[0]?.value) {
            matches.push({
              table_name: col.table_name,
              column_name: col.column_name,
              term,
              value: String(res.recordset[0].value).slice(0, 500),
            });
          }
        }
      }
      console.log(JSON.stringify({ matches }, null, 2));
      return;
    }

    if (INSPECT) {
      const selectCols = [
        obCol,
        nameCol,
        urlCol,
        captionCol,
        capturedAtCol,
        binaryCol ? `DATALENGTH(${q(binaryCol)}) AS binary_length` : null,
        base64Col ? `LEN(${q(base64Col)}) AS base64_length` : null,
      ].filter(Boolean);
      const topRes = await pool.request().query(`
        SELECT TOP 5 ${selectCols.join(', ')}
        FROM dbo.OccurrenceImages
        ORDER BY ${capturedAtCol ? q(capturedAtCol) : q(obCol)} DESC
      `);
      const countRes = await pool.request().query('SELECT COUNT(*) AS count FROM dbo.OccurrenceImages');
      console.log(JSON.stringify({
        count: countRes.recordset[0]?.count ?? 0,
        columns: colsRes.recordset,
        chosen: { obCol, binaryCol, base64Col, urlCol, nameCol, captionCol, capturedAtCol },
        sample: topRes.recordset,
      }, null, 2));
      return;
    }

    if (!binaryCol && !base64Col && !urlCol) {
      throw new Error('No legacy image source column found (expected binary/base64/url field).');
    }

    const queryCols = [obCol, nameCol, urlCol, captionCol, capturedAtCol, binaryCol, base64Col].filter(Boolean);
    const legacyRes = await pool.request().query(`
      SELECT ${queryCols.map((name) => q(name)).join(', ')}
      FROM dbo.OccurrenceImages
      ORDER BY ${capturedAtCol ? q(capturedAtCol) : q(obCol)} ASC
    `);
    const legacyRows = legacyRes.recordset ?? [];
    const sbRows = await loadSupabaseImageRows();

    const byStoragePath = new Map();
    const byObNumber = new Map();
    for (const row of sbRows) {
      byStoragePath.set(row.storage_path, row);
      const ob = row.ob_number ?? '';
      if (!byObNumber.has(ob)) byObNumber.set(ob, []);
      byObNumber.get(ob).push(row);
    }

    const stats = {
      legacyRows: legacyRows.length,
      matchedRows: 0,
      uploaded: 0,
      updated: 0,
      alreadyBackfilled: 0,
      missingSupabaseRow: 0,
      sourceUnavailable: 0,
      failedFetch: 0,
      failedUpload: 0,
      failedUpdate: 0,
    };

    let processed = 0;
    for (const legacyRow of legacyRows) {
      const obNumber = String(legacyRow[obCol] || '').trim();
      if (!obNumber) continue;

      const blobName = nameCol ? String(legacyRow[nameCol] || '').trim() : '';
      const blobUrl = urlCol ? String(legacyRow[urlCol] || '').trim() : '';
      const currentRow =
        byStoragePath.get(blobName) ||
        byStoragePath.get(blobUrl) ||
        (byObNumber.get(obNumber) || []).find((row) => row.storage_path === blobName || row.storage_path === blobUrl);

      if (!currentRow) {
        stats.missingSupabaseRow++;
        continue;
      }

      stats.matchedRows++;

      if (currentRow.storage_path.includes('/')) {
        stats.alreadyBackfilled++;
        continue;
      }

      if (LIMIT && processed >= LIMIT) break;

      processed++;
      if (processed === 1 || processed % 25 === 0) {
        console.log(`Processing pending ${processed}${LIMIT ? `/${LIMIT}` : ''}...`);
      }

      const fallbackSeed = `${sanitizeSegment(obNumber, 'ob')}-${crypto
        .createHash('sha1')
        .update(rowKey(legacyRow, nameCol, urlCol) || String(currentRow.id))
        .digest('hex')
        .slice(0, 12)}`;

      let bytes = null;
      let contentType = null;

      if (binaryCol && legacyRow[binaryCol]) {
        bytes = Buffer.isBuffer(legacyRow[binaryCol]) ? legacyRow[binaryCol] : Buffer.from(legacyRow[binaryCol]);
      } else if (base64Col && legacyRow[base64Col]) {
        bytes = decodeBase64(legacyRow[base64Col]);
      } else if (legacyContainerClient && blobName) {
        try {
          const download = await legacyContainerClient.getBlobClient(blobName).download();
          contentType = download.contentType || null;
          const chunks = [];
          for await (const chunk of download.readableStreamBody) chunks.push(Buffer.from(chunk));
          bytes = Buffer.concat(chunks);
        } catch {
          // Fall through to URL-based fetch if direct blob access fails.
        }
      } else if (blobUrl) {
        try {
          let res = await fetch(blobUrl);
          if (!res.ok) {
            const rawUrl = stripQuery(blobUrl);
            if (rawUrl && rawUrl !== blobUrl) res = await fetch(rawUrl);
          }
          if (!res.ok) {
            stats.failedFetch++;
            continue;
          }
          contentType = res.headers.get('content-type') || null;
          bytes = Buffer.from(await res.arrayBuffer());
        } catch {
          stats.failedFetch++;
          continue;
        }
      }

      if (!bytes || bytes.length === 0) {
        stats.sourceUnavailable++;
        continue;
      }

      const ext = guessExt(blobName || blobUrl, contentType);
      const targetName = stableObjectName(blobName || blobUrl, fallbackSeed, ext);
      const targetPath = `${ORG_SLUG}/${sanitizeSegment(obNumber, 'ob')}/${targetName}`;

      if (!DRY) {
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(targetPath, bytes, { upsert: true, contentType: contentType || guessContentType(ext) });
        if (uploadError) {
          stats.failedUpload++;
          continue;
        }
      }
      stats.uploaded++;

      if (!DRY) {
        const { error: updateError } = await supabase
          .from('occurrence_images')
          .update({ storage_path: targetPath })
          .eq('id', currentRow.id);
        if (updateError) {
          stats.failedUpdate++;
          continue;
        }
      }

      currentRow.storage_path = targetPath;
      byStoragePath.set(targetPath, currentRow);
      stats.updated++;
    }

    console.log(JSON.stringify({ dryRun: DRY, ...stats }, null, 2));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
