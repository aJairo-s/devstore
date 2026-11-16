// Acepta una URL de YouTube o un ID de 11 caracteres y devuelve solo el ID.
function parseYoutube(valor) {
  if (typeof valor !== 'string') return null;
  const v = valor.trim();
  if (!v) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  try {
    const u = new URL(v);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return validar(u.pathname.slice(1).split('/')[0]);
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') return validar(u.searchParams.get('v'));
      if (u.pathname.startsWith('/embed/')) return validar(u.pathname.split('/')[2]);
      if (u.pathname.startsWith('/shorts/')) return validar(u.pathname.split('/')[2]);
      if (u.pathname.startsWith('/live/')) return validar(u.pathname.split('/')[2]);
    }
    if (host === 'youtube-nocookie.com' && u.pathname.startsWith('/embed/')) return validar(u.pathname.split('/')[2]);
  } catch {
    return null;
  }
  return null;
}

function validar(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

module.exports = { parseYoutube };
