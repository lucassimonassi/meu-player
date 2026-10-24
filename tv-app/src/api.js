import { API_BASE } from './config.js';

// ---------- backend de ativacao ----------
export async function registerDevice(deviceUid) {
  const r = await fetch(`${API_BASE}/api/device/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_uid: deviceUid }),
  });
  if (!r.ok) throw new Error('Falha ao contatar o servidor de ativacao');
  return r.json();
}

// ---------- Xtream Codes (padrao publico de API) ----------
const enc = encodeURIComponent;

export function xtreamClient(pl) {
  const base = pl.server_url.replace(/\/+$/, '');
  const auth = `username=${enc(pl.username)}&password=${enc(pl.password)}`;
  const call = async (action, extra = '') => {
    const r = await fetch(`${base}/player_api.php?${auth}&action=${action}${extra}`);
    if (!r.ok) throw new Error('Erro ao carregar dados da lista');
    return r.json();
  };
  return {
    liveCategories: () => call('get_live_categories'),
    liveStreams: (catId) => call('get_live_streams', catId ? `&category_id=${enc(catId)}` : ''),
    vodCategories: () => call('get_vod_categories'),
    vodStreams: (catId) => call('get_vod_streams', catId ? `&category_id=${enc(catId)}` : ''),
    seriesCategories: () => call('get_series_categories'),
    series: (catId) => call('get_series', catId ? `&category_id=${enc(catId)}` : ''),
    seriesInfo: (id) => call('get_series_info', `&series_id=${enc(id)}`),
    liveUrl: (id) => `${base}/live/${enc(pl.username)}/${enc(pl.password)}/${id}.m3u8`,
    movieUrl: (id, ext) => `${base}/movie/${enc(pl.username)}/${enc(pl.password)}/${id}.${ext || 'mp4'}`,
    episodeUrl: (id, ext) => `${base}/series/${enc(pl.username)}/${enc(pl.password)}/${id}.${ext || 'mp4'}`,
  };
}

// ---------- M3U ----------
export async function loadM3U(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Erro ao baixar a lista M3U');
  const text = await r.text();
  const items = [];
  const groups = new Set();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXTINF')) {
      const name = line.substring(line.lastIndexOf(',') + 1).trim();
      const group = (line.match(/group-title="([^"]*)"/) || [])[1] || 'Sem categoria';
      const logo = (line.match(/tvg-logo="([^"]*)"/) || [])[1] || '';
      cur = { name, group, logo };
    } else if (line && !line.startsWith('#') && cur) {
      cur.url = line;
      items.push(cur);
      groups.add(cur.group);
      cur = null;
    }
  }
  return { items, groups: Array.from(groups) };
}
