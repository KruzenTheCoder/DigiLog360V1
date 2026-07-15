import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data: prof } = await supabase.from('profiles').select('site_ids, site_id').eq('email', 'kruz@site.com').single();
  const sites = Array.from(new Set([
    ...(Array.isArray(prof?.site_ids) ? prof.site_ids : []),
    ...(prof?.site_id ? [prof.site_id] : [])
  ]));
  console.log("Sites:", sites);

  const base = () => supabase.from('occurrences')
    .select('id, ob_number, occurrence_type, severity, status, site_name, site_id, logged_by_name, incident_at, closed_at, description')
    .in('status', ['resolved', 'closed'])
    .order('closed_at', { ascending: false })
    .limit(500);

  const results = await Promise.all(sites.map(sid => base().eq('site_id', sid)));
  console.log("Data length:", results.map(r => r.data?.length));
  console.log("Errors:", results.map(r => r.error));
}

test();
