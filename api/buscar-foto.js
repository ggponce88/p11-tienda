module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { producto_id, nombre, codigo_interno, codigo_barras } = req.body || {};
  if (!producto_id || !nombre) return res.status(400).json({ error: 'Faltan datos' });

  const SB_URL     = 'https://dlysfoqsvddltphojyed.supabase.co';
  const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_SERVICE) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY faltante' });

  try {
    // Buscar en ML con múltiples queries
    const queries = [codigo_barras, codigo_interno, nombre, nombre.split(' ').slice(0,3).join(' ')].filter(Boolean);
    let imageUrl = null, usedQuery = null;

    for (const q of queries) {
      const r = await fetch(`https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(q)}&limit=5`);
      if (!r.ok) continue;
      const d = await r.json();
      const item = (d.results || []).find(i => i.thumbnail);
      if (item) {
        imageUrl = item.thumbnail.replace('-I.jpg', '-O.jpg').replace('http://', 'https://');
        usedQuery = q;
        break;
      }
    }

    if (!imageUrl) return res.status(404).json({ error: 'Sin imágenes en ML' });

    // Descargar imagen
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!imgRes.ok) return res.status(500).json({ error: 'No se pudo descargar imagen' });
    const ct = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const ext = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : 'jpg';
    const path = `auto/${producto_id}-${Date.now()}.${ext}`;

    // Subir a Supabase Storage
    const up = await fetch(`${SB_URL}/storage/v1/object/productos-fotos/${path}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SB_SERVICE}`, 'Content-Type': ct, 'x-upsert': 'true' },
      body: buf,
    });
    if (!up.ok) return res.status(500).json({ error: `Storage error: ${await up.text()}` });

    const publicUrl = `${SB_URL}/storage/v1/object/public/productos-fotos/${path}`;

    // Guardar en producto_fotos
    await fetch(`${SB_URL}/rest/v1/producto_fotos`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SB_SERVICE}`, 'apikey': SB_SERVICE, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ producto_id, foto_url: publicUrl, orden: 0, es_principal: true }),
    });

    // Actualizar foto_url en productos
    await fetch(`${SB_URL}/rest/v1/productos?id=eq.${producto_id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${SB_SERVICE}`, 'apikey': SB_SERVICE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ foto_url: publicUrl }),
    });

    return res.status(200).json({ success: true, producto_id, foto_url: publicUrl, query: usedQuery });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
