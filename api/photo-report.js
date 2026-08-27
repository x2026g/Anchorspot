
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { spot_id, user_id, photo_base64 } = req.body || {};

  if (!spot_id || !photo_base64) {
    return res.status(400).json({ error: 'spot_id et photo_base64 sont requis' });
  }

  try {
    // 1. Upload de la photo dans le bucket privé
    const fileName = `${spot_id}/${Date.now()}-${crypto.randomUUID()}.jpg`;
    const buffer = Buffer.from(photo_base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('spot-photos')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });

    if (uploadError) throw uploadError;

    // 2. Détection IA (Claude vision) du nombre de bateaux
    const detection = await detectBoatCount(photo_base64);

    // 3. Enregistrement en base
    const { data, error: insertError } = await supabase
      .from('photo_reports')
      .insert({
        spot_id,
        user_id: user_id || null,
        photo_path: fileName,
        boat_count_detected: detection.count,
        confidence_score: detection.confidence,
        detection_status: detection.count !== null ? 'processed' : 'failed'
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return res.status(200).json({
      photo_report_id: data.id,
      boat_count_detected: data.boat_count_detected,
      confidence_score: data.confidence_score,
      // toujours signalé au client : la correction reste ouverte quelle que soit la confiance
      correction_available: true
    });
  } catch (err) {
    console.error('photo-report error:', err);
    return res.status(500).json({ error: 'Erreur lors du traitement de la photo' });
  }
}

async function detectBoatCount(photoBase64) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: photoBase64 }
            },
            {
              type: 'text',
              text: 'Compte le nombre de bateaux au mouillage visibles sur cette photo (ignore les bateaux au port/à quai s\'il y en a). ' +
                    'Réponds UNIQUEMENT avec un objet JSON, sans aucun texte autour, au format exact: ' +
                    '{"count": <nombre entier>, "confidence": <valeur entre 0 et 1>}'
            }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      count: Number.isInteger(parsed.count) ? parsed.count : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null
    };
  } catch (err) {
    console.error('detectBoatCount error:', err);
    return { count: null, confidence: null };
  }
}
