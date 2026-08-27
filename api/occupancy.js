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
  // Récupérer tous les signalements actifs (non expirés), arrivées ET départs,
  // pour pouvoir faire correspondre chaque départ à sa dernière arrivée par bateau.
  const { data: reports, error: reportsError } = await supabase
    .from('occupancy_reports')
    .select('*')
    .eq('spot_id', spot_id)
    .gt('expires_at', new Date().toISOString());
  if (reportsError) {
    return res.status(500).json({ error: 'Erreur de lecture des signalements' });
  }

  // Pour chaque bateau (user_id), on ne garde l'arrivée que si aucun départ
  // n'a été signalé APRÈS cette arrivée (created_at). Un départ annule ainsi
  // immédiatement l'arrivée correspondante, sans attendre son expiration naturelle.
  // Les signalements sans user_id (legacy / anonymes) sont conservés tels quels,
  // comptés individuellement, faute de pouvoir les rattacher à un départ précis.
  const arrivalReports = reports.filter(r => r.report_type === 'arrival');
  const departureReports = reports.filter(r => r.report_type === 'departure');

  const activeArrivals = arrivalReports.filter((arrival) => {
    if (!arrival.user_id) return true; // pas de user_id : impossible de matcher un départ, on garde
    const hasLaterDeparture = departureReports.some(
      (dep) => dep.user_id === arrival.user_id && new Date(dep.created_at) > new Date(arrival.created_at)
    );
    return !hasLaterDeparture;
  });

  const activeBoats = activeArrivals.length;
  const threshold = spot.capacity_threshold || 15;
  const ratio = activeBoats / threshold;
  let status = 'données insuffisantes';
  // Le seuil de fiabilité (>=2) porte sur les arrivées actives restantes après
  // application des départs, pas sur le total brut des signalements.
  if (activeArrivals.length >= 2) {
    if (ratio < 0.6) status = 'libre';
    else if (ratio < 0.9) status = 'limité';
    else status = 'complet';
  }
  return res.status(200).json({
    spot_id: spot.id,
    name: spot.name,
    status,
    active_boats_estimate: activeBoats,
    reports_count: activeArrivals.length,
    last_updated: new Date().toISOString()
  });
}
