// Super-user-only: create a new organization (tenant) and optionally provision
// its first admin user in one shot.
//
// Body:
//   {
//     org: { name, slug, legal_name?, contact_email?, contact_phone?, address?,
//            plan?, max_users?, max_sites?, trial_ends_at?, primary_color?,
//            logo_url? },
//     first_admin?: { email, password, full_name?, employee_number?, phone? }
//   }
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, isSuperUser } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);
  if (!isSuperUser(result.profile)) return json({ error: 'Super user required' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const orgInput = (body.org ?? {}) as Record<string, unknown>;
  const name = String(orgInput.name ?? '').trim();
  const slug = String(orgInput.slug ?? '').trim().toLowerCase();
  if (!name || !slug) return json({ error: 'org.name and org.slug are required' }, 400);
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'slug must be kebab-case' }, 400);

  const { data: created, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name,
      slug,
      legal_name: orgInput.legal_name ?? null,
      contact_email: orgInput.contact_email ?? null,
      contact_phone: orgInput.contact_phone ?? null,
      address: orgInput.address ?? null,
      plan: orgInput.plan ?? 'standard',
      max_users: orgInput.max_users ?? null,
      max_sites: orgInput.max_sites ?? null,
      trial_ends_at: orgInput.trial_ends_at ?? null,
      primary_color: orgInput.primary_color ?? null,
      logo_url: orgInput.logo_url ?? null,
    })
    .select('*')
    .single();
  if (orgErr) return json({ error: orgErr.message }, 400);

  let firstAdmin: Record<string, unknown> | null = null;
  if (body.first_admin) {
    const fa = body.first_admin as Record<string, unknown>;
    const email = String(fa.email ?? '').trim().toLowerCase();
    const password = String(fa.password ?? '');
    if (!email || password.length < 6) {
      return json({
        org: created,
        warning: 'first_admin skipped: email and 6+ char password required',
      }, 201);
    }
    const { data: u, error: uErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: {
        role: 'admin',
        org_id: created.id,
        full_name: fa.full_name ?? null,
        employee_number: fa.employee_number ?? null,
      },
    });
    if (uErr) {
      return json({ org: created, warning: `first_admin failed: ${uErr.message}` }, 201);
    }
    await admin.from('profiles').update({
      role: 'admin',
      org_id: created.id,
      full_name: fa.full_name ?? null,
      phone: fa.phone ?? null,
      email,
      employee_number: fa.employee_number ?? null,
    }).eq('id', u.user!.id);
    firstAdmin = { id: u.user!.id, email, role: 'admin' };
  }

  return json({ org: created, first_admin: firstAdmin }, 201);
});
