# P11 Tecnología — Tienda Web

E-commerce completo para P11 Tecnología. Conectado a Supabase para stock en tiempo real.

---

## 🚀 Deploy en Vercel (igual que P11 Gestión)

1. Crear repo en GitHub → subir estos archivos
2. En Vercel → "New Project" → importar el repo
3. Configurar variables de entorno (ver abajo)
4. ✅ Listo

---

## 🔑 Variables de entorno en Vercel

En Vercel → Settings → Environment Variables:

| Variable | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | Tu Access Token de Mercado Pago (ver abajo) |
| `NEXT_PUBLIC_SITE_URL` | URL de tu sitio (ej: `https://p11-tienda.vercel.app`) |

---

## 💳 Obtener Access Token de Mercado Pago

1. Ir a: https://www.mercadopago.com.ar/developers/panel
2. Crear una aplicación nueva (nombre: "P11 Tienda")
3. Ir a "Credenciales de producción"
4. Copiar el **Access Token** (empieza con `APP_USR-...`)
5. Pegarlo en Vercel como `MP_ACCESS_TOKEN`

> **Nota sobre la cuenta:** Una cuenta de Mercado Pago con CUIT de monotributista
> sirve perfectamente para cobrar online. No necesitás una cuenta "Business" especial.

---

## 🗄️ Configurar Supabase

### 1. Crear tabla de pedidos
Abrir Supabase → SQL Editor → pegar y ejecutar el contenido de `setup.sql`

### 2. Agregar imágenes a productos (opcional pero recomendado)
- En Supabase, ejecutar: `ALTER TABLE products ADD COLUMN IF NOT EXISTS imagen_url TEXT;`
- Subir imágenes a Supabase Storage o a cualquier hosting de imágenes
- Actualizar la columna `imagen_url` de cada producto con la URL de la imagen

### 3. Marcar productos como "Oferta/Destacado"
```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS destacado BOOLEAN DEFAULT FALSE;
UPDATE products SET destacado = TRUE WHERE id IN (1, 2, 3); -- IDs de tus productos
```

---

## 🔄 Go Cuotas — Integración pendiente

Cuando tengas el acceso a Go Cuotas para comercios, buscá en `index.html`
la línea con el comentario `← COMPLETAR: reemplazar con tu link de Go Cuotas real`
y reemplazá por la URL o lógica que ellos te provean.

---

## 💰 Transferencia bancaria

En `index.html`, buscá el objeto `TRANSFER` y completá con tu alias y CBU:
```js
const TRANSFER = {
  alias:  'TU.ALIAS',    // tu alias de MP o bancario
  cbu:    '...',         // tu CBU
  banco:  'Mercado Pago',
};
```

---

## 📦 Estructura del proyecto

```
p11-store/
├── index.html       ← Tienda completa (frontend)
├── api/
│   └── checkout.js  ← Serverless function para Mercado Pago
├── vercel.json      ← Configuración de Vercel
├── setup.sql        ← SQL para crear tabla de pedidos
└── README.md
```

---

## ✅ Funcionalidades incluidas

- Catálogo con filtro por categoría y búsqueda en tiempo real
- Stock sincronizado con P11 Gestión (misma base Supabase)
- Sección "Ofertas" con productos destacados
- Carrito de compras persistente (localStorage)
- Checkout multi-paso:
  - Datos de contacto
  - Tipo de entrega (envío / retiro en local)
  - Mercado Pago, Go Cuotas, Transferencia
- Registro de pedidos en Supabase
- Mapa del local + contacto
- Diseño 100% acorde al Brand Book de P11
- Responsive (mobile + desktop)
