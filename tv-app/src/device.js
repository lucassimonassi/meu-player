// Gera/recupera um ID unico do aparelho e o guarda no localStorage.
// Tizen e webOS nao entregam o MAC real por privacidade, entao o backend deriva um "MAC virtual" deste ID.
const KEY = 'device_uid';

function randomId() {
  const bytes = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getDeviceUid() {
  let uid = null;
  try {
    uid = localStorage.getItem(KEY);
  } catch (_) {}
  if (!uid) {
    // Tizen: usa o DUID oficial se estiver disponivel (sobrevive a reinstalacao).
    try {
      if (window.webapis && window.webapis.productinfo) uid = 'tizen-' + window.webapis.productinfo.getDuid();
    } catch (_) {}
    if (!uid) uid = 'tv-' + randomId();
    try {
      localStorage.setItem(KEY, uid);
    } catch (_) {}
  }
  return uid;
}
