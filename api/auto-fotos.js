/**
 * api/auto-fotos.js — Búsqueda automática de fotos de productos
 *
 * Variables de entorno requeridas en Vercel:
 *   GOOGLE_API_KEY      → API Key de Google Cloud (con Custom Search habilitado)
 *   GOOGLE_CX           → ID del Custom Search Engine (configurado para imágenes)
 *   SUPABASE_URL        → https://dlysfoqsvddltphojyed.supabase.co
 *   SUPABASE_SERVICE_KEY → Service Role Key de Supabase (NO la anon key)
 */

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { producto_id, nombre, marca, codigo_interno, codigo_barras } = req.body;
  if (!producto_id || !nombre) return res.status(400).json({ error: 'Faltan datos del producto' });

  const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
  const GOOGLE_CX  = process.env.GOOGLE_CX;
  const SB_URL     = process.env.SUPABASE_URL || 'https://dlysfoqsvddltphojyed.supabase.co';
  const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;

  if (!GOOGLE_KEY || !GOOGLE_CX) return res.status(500).json({ error: 'Credenciales de Google no configuradas' });
  if (!SB_SERVICE) return res.status(500).json({ error: 'Service key de Supabase no configurada' });

  try {
    // ── 1. Construir query de búsqueda ──────────────────────────
    const queryParts = [nombre];
    if (marca) queryParts.push(marca);
    if (codigo_interno) queryParts.push(codigo_interno);
    if (codigo_barras) queryParts.push(codigo_barras);
    const query = queryParts.join(' ');

    // ── 2. Buscar imagen con Google Custom Search ───────────────
    const searchUrl = `https://www.googleapis.com/customsearch/v1?` +
      `key=${GOOGLE_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}` +
      `&searchType=image&imgSize=large&imgType=photo&num=3` +
      `&safe=active&fields=items(link,image(contextLink))`;

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.items || searchData.items.length === 0) {
      return res.status(404).json({ error: 'No se encontraron imágenes', query });
    }

    // ── 3. Intentar descargar la primera imagen válida ──────────
    let imageBuffer = null;
    let imageType = 'image/jpeg';
    let usedUrl = null;

    for (const item of searchData.items) {
      try {
        const imgRes = await fetch(item.link, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; P11Bot/1.0)' },
          signal: AbortSignal.timeout(8000),
        });
        if (!imgRes.ok) continue;
        const ct = imgRes.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) continue;
        imageType = ct.split(';')[0];
        imageBuffer = Buffer.from(await imgRes.arrayBuffer());
        usedUrl = item.link;
        if (imageBuffer.length > 10000) break; // imagen válida
      } catch { continue; }
    }

    if (!imageBuffer) return res.status(404).json({ error: 'No se pudo descargar ninguna imagen', query });

    // ── 4. Subir a Supabase Storage ─────────────────────────────
    const ext = imageType === 'image/png' ? 'png' : imageType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `${producto_id}-auto-${Date.now()}.${ext}`;
    const storagePath = `auto/${fileName}`;

    const uploadRes = await fetch(
      `${SB_URL}/storage/v1/object/productos-fotos/${storagePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SB_SERVICE}`,
          'Content-Type': imageType,
          'x-upsert': 'true',
        },
        body: imageBuffer,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return res.status(500).json({ error: `Error subiendo imagen: ${err}` });
    }

    const publicUrl = `${SB_URL}/storage/v1/object/public/productos-fotos/${storagePath}`;

    // ── 5. Insertar en tabla producto_fotos ─────────────────────
    const insertRes = await fetch(`${SB_URL}/rest/v1/producto_fotos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SB_SERVICE}`,
        'apikey': SB_SERVICE,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        producto_id,
        foto_url: publicUrl,
        orden: 0,
        es_principal: true,
      }),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      return res.status(500).json({ error: `Error guardando en DB: ${err}` });
    }

    // ── 6. También actualizar foto_url en productos ─────────────
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
      query_usada: query,
      fuente: usedUrl,
    });

  } catch (err) {
    console.error('auto-fotos error:', err);
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
}
