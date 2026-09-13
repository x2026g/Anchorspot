   import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
  

const ARRIVAL_RADIUS_METERS = 150;

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id, lat, lon, spot_id, boat_count_seen } = req.body;

  if (!user_id || lat === undefined || lon === undefined || !spot_id) {
    return res.status(400).json({ error: 'user_id, lat, lon, spot_id requis' });
  }

  const { data: spot, error: spotError } = await supabase
    .from('mooring_spots')
    .select('id, lat, lng')
    .eq('id', spot_id)
    .single();

  if (spotError || !spot) {
    return res.status(404).json({ error: 'Mouillage introuvable' });
  }

  const distance = haversineDistance(lat, lon, spot.lat, spot.lng);
  const isArrival = distance <= ARRIVAL_RADIUS_METERS;

  const { data: lastReport } = await supabase
    .from('occupancy_reports')
    .select('id, report_type, created_at, expires_at')
    .eq('user_id', user_id)
    .eq('spot_id', spot_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasActiveArrival =
    lastReport &&
    lastReport.report_type === 'arrival' &&
    new Date(lastReport.expires_at) > new Date();

  if (isArrival) {
    if (hasActiveArrival) {
      const { error: updateError } = await supabase
        .from('occupancy_reports')
        .update({
          expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
          ...(boat_count_seen !== undefined && { boat_count_seen }),
        })
        .eq('id', lastReport.id);

      if (updateError) return res.status(500).json({ error: updateError.message });
      return res.status(200).json({ report_type: 'arrival_confirmed', report_id: lastReport.id });
    }

    const { data: newReport, error: insertError } = await supabase
      .from('occupancy_reports')
      .insert({
        user_id,
        spot_id,
        report_type: 'arrival',
        boat_count_seen: boat_count_seen ?? null,
      })
      .select()
      .single();

    if (insertError) return res.status(500).json({ error: insertError.message });
    return res.status(201).json({ report_type: 'arrival', report_id: newReport.id });
  } else {
    if (!hasActiveArrival) {
      return res.status(200).json({ report_type: 'no_active_arrival_to_close' });
    }

    const { data: newReport, error: insertError } = await supabase
      .from('occupancy_reports')
      .insert({
        user_id,
        spot_id,
        report_type: 'departure',
      })
      .select()
      .single();

    if (insertError) return res.status(500).json({ error: insertError.message });
    return res.status(200).json({ report_type: 'departure', report_id: newReport.id });
  }
}
