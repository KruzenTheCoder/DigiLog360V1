import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { AutoPrint } from '@/components/reports/auto-print';
import { BRAND, SEVERITY_LABELS, STATUS_LABELS } from '@digilog/shared';
import { formatDateTime } from '@/lib/utils';
import type { Occurrence, OccurrenceReport, OccurrenceUpdate } from '@digilog/shared';

export const dynamic = 'force-dynamic';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <tr>
      <td style={{ padding: '4px 8px', fontWeight: 600, color: '#475569', width: 200, verticalAlign: 'top' }}>{label}</td>
      <td style={{ padding: '4px 8px', color: '#1e293b' }}>{value}</td>
    </tr>
  );
}

export default async function PrintReportPage({ params }: { params: Promise<{ ob: string }> }) {
  await requireProfile();
  const { ob } = await params;
  const supabase = await createClient();

  const { data: occ } = await supabase.from('occurrences').select('*').eq('ob_number', ob).single();
  if (!occ) notFound();
  const o = occ as Occurrence;

  const [{ data: report }, { data: updates }] = await Promise.all([
    supabase.from('occurrence_reports').select('*').eq('occurrence_id', o.id).maybeSingle(),
    supabase.from('occurrence_updates').select('*').eq('occurrence_id', o.id).order('created_at', { ascending: false }),
  ]);
  const rep = report as OccurrenceReport | null;
  const upd = (updates ?? []) as OccurrenceUpdate[];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 40, color: '#1e293b', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 16mm; } }`}</style>
      <AutoPrint />

      <div style={{ textAlign: 'center', borderBottom: `3px solid ${BRAND.primary}`, paddingBottom: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#475569' }}>{BRAND.company.toUpperCase()}</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: BRAND.primary, margin: '6px 0' }}>OCCURRENCE REPORT — {o.ob_number}</h1>
        <div style={{ fontSize: 12, color: '#64748b' }}>Generated {formatDateTime(new Date())}</div>
      </div>

      <h2 style={{ background: '#f1f5f9', padding: 8, fontSize: 15 }}>Basic Information</h2>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 16 }}><tbody>
        <Row label="Occurrence Number" value={o.ob_number} />
        <Row label="Type" value={o.occurrence_type} />
        <Row label="Severity" value={SEVERITY_LABELS[o.severity]} />
        <Row label="Status" value={STATUS_LABELS[o.status]} />
        <Row label="Site" value={o.site_name} />
        <Row label="Incident Date & Time" value={formatDateTime(o.incident_at)} />
        <Row label="Logged By" value={o.logged_by_name} />
        <Row label="Logged At" value={formatDateTime(o.created_at)} />
      </tbody></table>

      <h2 style={{ background: '#f1f5f9', padding: 8, fontSize: 15 }}>Description</h2>
      <p style={{ fontSize: 13, lineHeight: 1.6, padding: '8px 8px 16px' }}>{o.description}</p>

      {rep && (
        <>
          <h2 style={{ background: '#f1f5f9', padding: 8, fontSize: 15 }}>Detailed Report</h2>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 12 }}><tbody>
            <Row label="Personnel Involved" value={rep.personnel} />
            <Row label="Responding Officer" value={rep.responding_officer} />
            <Row label="Emergency Services" value={rep.emergency_services} />
            <Row label="External Case #" value={rep.external_case} />
            <Row label="CCTV Available" value={rep.cctv} />
            <Row label="CCTV Times" value={rep.cctv_times} />
            <Row label="Property Damage" value={rep.property_damage} />
          </tbody></table>
          {rep.immediate_actions && <><p style={{ fontWeight: 600, fontSize: 13, padding: '4px 8px' }}>Immediate Actions:</p><p style={{ fontSize: 13, lineHeight: 1.6, padding: '0 8px 12px' }}>{rep.immediate_actions}</p></>}
          {rep.next_steps && <><p style={{ fontWeight: 600, fontSize: 13, padding: '4px 8px' }}>Next Steps:</p><p style={{ fontSize: 13, lineHeight: 1.6, padding: '0 8px 12px' }}>{rep.next_steps}</p></>}
        </>
      )}

      {upd.length > 0 && (
        <>
          <h2 style={{ background: '#f1f5f9', padding: 8, fontSize: 15 }}>Updates ({upd.length})</h2>
          {upd.map((u) => (
            <div key={u.id} style={{ background: '#f8fafc', padding: 10, marginBottom: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: BRAND.primary }}>Status: {STATUS_LABELS[u.status]}</div>
              <div style={{ color: '#64748b' }}>{u.updated_by_name} · {formatDateTime(u.created_at)}</div>
              <div style={{ marginTop: 4 }}>{u.notes}</div>
            </div>
          ))}
        </>
      )}

      <div style={{ textAlign: 'center', borderTop: '1px solid #e5e7eb', marginTop: 24, paddingTop: 8, fontSize: 11, color: '#9ca3af' }}>
        End of Report · Generated by {BRAND.name}
      </div>
    </div>
  );
}
