const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args)).catch(() => globalThis.fetch(...args));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { producto_id, nombre, codigo_interno, codigo_barras } = req.body || {};
  if (!producto_id || !nombre) return res.status(400).json({ error: 'Faltan datos' });

  const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
  const GOOGLE_CX  = process.env.GOOGLE_CX;
  const SB_URL     = process.env.SUPABASE_URL || 'https://dlysfoqsvddltphojyed.supabase.co';
  const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

  if (!GOOGLE_KEY || !GOOGLE_CX) return res.status(500).json({ error: 'Credenciales Google no configuradas' });
  if (!SB_SERVICE) return res.status(500).json({ error: 'Service key Supabase no configurada' });

  try {
    const parts = [nombre];
    if (codigo_interno) parts.push(codigo_interno);
    if (codigo_barras) parts.push(codigo_barras);
    const query = parts.join(' ');

    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}&searchType=image&imgSize=large&num=5&safe=active`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.items || searchData.items.length === 0)
      return res.status(404).json({ error: 'No se encontraron imágenes', query });

    let imageBuffer = null, imageType = 'image/jpeg', sourceUrl = null;

    for (const item of searchData.items) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const imgRes = await fetch(item.link, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
        clearTimeout(timeout);
        if (!imgRes.ok) continue;
        const ct = imgRes.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) continue;
        const buf = await imgRes.arrayBuffer();
        if (buf.byteLength < 5000) continue;
        imageBuffer = Buffer.from(buf);
        imageType = ct.split(';')[0];
        sourceUrl = item.link;
        break;
      } catch { continue; }
    }

    if (!imageBuffer) return res.status(404).json({ error: 'No se pudo descargar imagen', query });

    const ext = imageType === 'image/png' ? 'png' : imageType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `auto/${producto_id}-${Date.now()}.${ext}`;

    const uploadRes = await fetch(`${SB_URL}/storage/v1/object/productos-fotos/${fileName}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SB_SERVICE}`, 'Content-Type': imageType, 'x-upsert': 'true' },
      body: imageBuffer,
    });

    if (!uploadRes.ok) return res.status(500).json({ error: `Upload error: ${await uploadRes.text()}` });

    const publicUrl = `${SB_URL}/storage/v1/object/public/productos-fotos/${fileName}`;

    await fetch(`${SB_URL}/rest/v1/producto_fotos`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SB_SERVICE}`, 'apikey': SB_SERVICE, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ producto_id, foto_url: publicUrl, orden: 0, es_principal: true }),
    });

    await fetch(`${SB_URL}/rest/v1/productos?id=eq.${producto_id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${SB_SERVICE}`, 'apikey': SB_SERVICE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ foto_url: publicUrl }),
    });

    return res.status(200).json({ success: true, producto_id, foto_url: publicUrl, query });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
};
