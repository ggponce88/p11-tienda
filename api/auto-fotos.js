module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { producto_id, nombre, codigo_interno, codigo_barras } = req.body || {};
  if (!producto_id || !nombre) return res.status(400).json({ error: 'Faltan datos' });

  const SB_URL     = 'https://dlysfoqsvddltphojyed.supabase.co';
  const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_SERVICE) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY no configurada' });

  try {
    // 1. Buscar en Mercado Libre Argentina
    const queries = [
      codigo_barras ? codigo_barras : null,
      codigo_interno ? codigo_interno : null,
      nombre,
      nombre.split(' ').slice(0, 4).join(' '), // nombre corto
    ].filter(Boolean);

    let imageUrl = null;
    let usedQuery = null;

    for (const q of queries) {
      try {
        const mlRes = await fetch(
          `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(q)}&limit=5`,
          { headers: { 'Accept': 'application/json' } }
        );
        if (!mlRes.ok) continue;
        const mlData = await mlRes.json();
        const items = mlData.results || [];

        // Buscar primer item con thumbnail de calidad
        for (const item of items) {
          if (item.thumbnail && item.thumbnail.includes('http')) {
            // Convertir thumbnail a imagen grande
            imageUrl = item.thumbnail
              .replace('-I.jpg', '-O.jpg')   // original
              .replace('http://', 'https://');
            usedQuery = q;
            break;
          }
        }
        if (imageUrl) break;
      } catch { continue; }
    }

    if (!imageUrl) return res.status(404).json({ error: 'No se encontraron imágenes en ML', queries });

    // 2. Descargar la imagen
    let imageBuffer, imageType = 'image/jpeg';
    try {
      const imgRes = await fetch(imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
      const ct = imgRes.headers.get('content-type') || 'image/jpeg';
      imageType = ct.split(';')[0];
      imageBuffer = Buffer.from(await imgRes.arrayBuffer());
    } catch(e) {
      return res.status(500).json({ error: `No se pudo descargar la imagen: ${e.message}`, imageUrl });
    }

    // 3. Subir a Supabase Storage
    const ext = imageType === 'image/png' ? 'png' : imageType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `auto/${producto_id}-${Date.now()}.${ext}`;

    const uploadRes = await fetch(`${SB_URL}/storage/v1/object/productos-fotos/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SB_SERVICE}`,
        'Content-Type': imageType,
        'x-upsert': 'true',
      },
      body: imageBuffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return res.status(500).json({ error: `Error subiendo a Storage: ${errText}` });
    }

    const publicUrl = `${SB_URL}/storage/v1/object/public/productos-fotos/${fileName}`;

    // 4. Insertar en producto_fotos
    await fetch(`${SB_URL}/rest/v1/producto_fotos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SB_SERVICE}`,
        'apikey': SB_SERVICE,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ producto_id, foto_url: publicUrl, orden: 0, es_principal: true }),
    });

    // 5. Actualizar foto_url en productos
    await fetch(`${SB_URL}/rest/v1/productos?id=eq.${producto_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${SB_SERVICE}`,
        'apikey': SB_SERVICE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ foto_url: publicUrl }),
    });

    return res.status(200).json({
      success: true,
      producto_id,
      foto_url: publicUrl,
      query_usada: usedQuery,
      fuente_ml: imageUrl,
    });

  } catch (err) {
    console.error('auto-fotos error:', err);
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
};
