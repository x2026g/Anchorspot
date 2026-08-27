
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'POST') return handleSubmitCorrection(req, res);
  if (req.method === 'GET') return handleGetFinalCount(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleSubmitCorrection(req, res) {
  const { photo_report_id, user_id, corrected_count } = req.body || {};

  if (!photo_report_id || !user_id || !Number.isInteger(corrected_count) || corrected_count < 0) {
    return res.status(400).json({ error: 'photo_report_id, user_id et corrected_count (entier >= 0) sont requis' });
  }

  // upsert : un utilisateur ne peut avoir qu'une correction par photo (il peut la modifier)
  const { error } = await supabase
    .from('photo_report_corrections')
    .upsert(
      { photo_report_id, user_id, corrected_count },
      { onConflict: 'photo_report_id,user_id' }
    );

  if (error) {
    console.error('submit correction error:', error);
    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la correction' });
  }

  const final = await computeFinalCount(photo_report_id);
  return res.status(200).json(final);
}

async function handleGetFinalCount(req, res) {
  const { photo_report_id } = req.query || {};
  if (!photo_report_id) {
    return res.status(400).json({ error: 'photo_report_id est requis' });
  }
  const final = await computeFinalCount(photo_report_id);
  return res.status(200).json(final);
}

async function computeFinalCount(photoReportId) {
  const { data: report } = await supabase
    .from('photo_reports')
    .select('boat_count_detected, confidence_score')
    .eq('id', photoReportId)
    .single();

  const { data: corrections } = await supabase
    .from('photo_report_corrections')
    .select('corrected_count')
    .eq('photo_report_id', photoReportId);

  if (corrections && corrections.length >= 2) {
    const counts = corrections.map(c => c.corrected_count).sort((a, b) => a - b);
    const mid = Math.floor(counts.length / 2);
    const median = counts.length % 2 !== 0
      ? counts[mid]
      : Math.round((counts[mid - 1] + counts[mid]) / 2);

    return {
      final_count: median,
      source: 'community_correction',
      correction_count: corrections.length
    };
  }

  return {
    final_count: report?.boat_count_detected ?? null,
    source: 'ai_detection',
    confidence_score: report?.confidence_score ?? null,
    correction_count: corrections?.length ?? 0
  };
}
