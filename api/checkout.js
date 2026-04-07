/**
 * api/checkout.js — Vercel Serverless Function
 * Crea una preferencia de Mercado Pago y devuelve el init_point
 *
 * Variable de entorno requerida en Vercel:
 *   MP_ACCESS_TOKEN = tu Access Token de Mercado Pago
 */

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { items, buyer, total } = req.body;

  if (!items || !buyer) {
    return res.status(400).json({ error: 'Faltan datos del pedido' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: 'Access token de MP no configurado' });
  }

  // URL base del sitio (configurar en Vercel como variable de entorno)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.host}`;

  try {
    const preference = {
      items: items.map(item => ({
        title:      item.title,
        quantity:   item.quantity,
        unit_price: Number(item.unit_price),
        currency_id: 'ARS',
      })),
      payer: {
        name:  buyer.name,
        email: buyer.email,
        phone: { number: String(buyer.phone || '') },
      },
      back_urls: {
        success: `${baseUrl}/success.html`,
        failure: `${baseUrl}/failure.html`,
        pending: `${baseUrl}/pending.html`,
      },
      auto_return:          'approved',
      statement_descriptor: 'P11 TECNOLOGIA',
      external_reference:   `p11-${Date.now()}`,
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
        'X-Idempotency-Key': `p11-${Date.now()}-${Math.random()}`,
      },
      body: JSON.stringify(preference),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error('MP error:', mpData);
      return res.status(500).json({ error: mpData.message || 'Error en Mercado Pago' });
    }

    return res.status(200).json({
      init_point:    mpData.init_point,    // URL checkout producción
      sandbox_point: mpData.sandbox_init_point, // URL para pruebas
      id:            mpData.id,
    });

  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

