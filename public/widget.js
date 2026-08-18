(function () {
  const API_BASE = 'https://anchorspot.vercel.app/api/occupancy';

  const STATUS_CONFIG = {
    'libre': { color: '#22c55e', emoji: '🟢', label: 'Activité normale' },
    'limité': { color: '#f97316', emoji: '🟠', label: 'Activité élevée' },
    'complet': { color: '#ef4444', emoji: '🔴', label: 'Très fréquenté' },
    'données insuffisantes': { color: '#9ca3af', emoji: '⚪', label: 'Données limitées' }
  };

  async function renderWidget(elementId, spotId) {
    const container = document.getElementById(elementId);
    if (!container) return;

    container.innerHTML = '<div style="font-family:sans-serif;font-size:13px;color:#888;">Chargement...</div>';

    try {
      const res = await fetch(`${API_BASE}?spot_id=${spotId}`);
      const data = await res.json();

      if (data.error) {
        container.innerHTML = '';
        return;
      }

      const config = STATUS_CONFIG[data.status] || STATUS_CONFIG['données insuffisantes'];

      container.innerHTML = `
        <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:16px;background:${config.color}1a;border:1px solid ${config.color};font-family:sans-serif;font-size:13px;color:${config.color};font-weight:600;">
          <span>${config.emoji}</span>
          <span>${config.label}</span>
        </div>
        <div style="font-family:sans-serif;font-size:11px;color:#999;margin-top:4px;">
          ⚓ Propulsé par AnchorSpot
        </div>
      `;
    } catch (e) {
      container.innerHTML = '';
    }
  }

  window.AnchorSpotWidget = { render: renderWidget };
})();
