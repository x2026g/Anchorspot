import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  const { spot_id } = req.query;

  if (!spot_id) {
    return res.status(400).json({ error: 'spot_id requis' });
  }

  // Récupérer les infos du mouillage
  const { data: spot, error: spotError } = await supabase
    .from('mooring_spots')
    .select('*')
    .eq('id', spot_id)
    .single();

  if (spotError || !spot) {
    return res.status(404).json({ error: 'Mouillage introuvable' });
  }

  // Compter les signalements actifs (arrivées non expirées, sans départ)
  const { data: reports, error: reportsError } = await supabase
    .from('occupancy_reports')
    .select('*')
    .eq('spot_id', spot_id)
    .gt('expires_at', new Date().toISOString());

  if (reportsError) {
    return res.status(500).json({ error: 'Erreur de lecture des signalements' });
  }

  const activeBoats = reports.filter(r => r.report_type === 'arrival').length;
  const threshold = spot.capacity_threshold || 15;
  const ratio = activeBoats / threshold;

  let status = 'données insuffisantes';
  if (reports.length >= 2) {
    if (ratio < 0.6) status = 'libre';
    else if (ratio < 0.9) status = 'limité';
    else status = 'complet';
  }

  return res.status(200).json({
    spot_id: spot.id,
    name: spot.name,
    status,
    active_boats_estimate: activeBoats,
    reports_count: reports.length,
    last_updated: new Date().toISOString()
  });
}
