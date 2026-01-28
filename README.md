# FinanzApp

Aplicación web de finanzas personales (Next.js + Supabase) pensada para uso diario.

- Login con email/contraseña (confirmación y recuperación)
- Cuentas con saldo inicial
- Categorías como plantillas (Ingreso/Gasto + importe)
- Movimientos del mes (fijos por plantilla + variables)
- Transferencias entre cuentas
- Resumen mensual con cierre/desbloqueo por cuenta

## Stack

- Next.js 14 (App Router) + React + TypeScript
- Supabase
	- Auth (email/password, confirmación por email, recuperación de contraseña)
	- Postgres + PostgREST

## Requisitos

- Node.js 18+
- Un proyecto en Supabase

## Estructura del repo

```
finanzapp/
	src/
		app/               # App Router (rutas + UI)
		lib/               # supabase client, helpers y tipos
	database/
		database.sql       # schema/migraciones + RLS
	public/
		manifest.webmanifest
		icon-192.png
		icon-512.png
	docs/
	next.config.mjs
	package.json
	tsconfig.json
	README.md
```

## Arrancar en local

1) Instalar dependencias

```bash
npm install
```

2) Configurar variables de entorno

Crea el archivo `.env.local` en la raíz del repo:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY

# Recomendado: URL pública donde vive la app (para enlaces de email)
# Si no se define, se usa window.location.origin.
# NEXT_PUBLIC_APP_URL=https://tu-dominio.com
```

3) Preparar base de datos (Supabase)

El SQL vive en `database/database.sql`.

- Proyecto nuevo: ejecuta el bloque **SCHEMA (fresh install only)**
- Luego (o si ya existía): ejecuta el bloque **MULTI-USER SAFETY (RLS)**

Si ya tenías un DB existente y te falla el join `transactions -> categories`, ejecuta el bloque **MIGRATION (existing DB)**.

4) Ejecutar

```bash
npm run dev
```

Abre http://localhost:3000

## Scripts

```bash
npm run dev      # desarrollo
npm run build    # build de producción
npm run start    # servir build (requiere build)
npm run lint     # lint (Next ESLint)
```

## Configuración de Auth (Supabase)

En Supabase → Authentication → URL Configuration:

- **Site URL**: tu dominio principal (p. ej. `https://tu-app.vercel.app`)
- **Additional Redirect URLs**:
	- `https://TU-DOMINIO/auth/callback` (confirmación email / OAuth callback)
	- `https://TU-DOMINIO/auth/reset` (recuperación de contraseña)

Notas:

- Supabase puede mandar enlaces con `?code=...`, `?token_hash=...&type=...` o en el hash `#access_token=...`. La app soporta estos formatos.
- Si pruebas en local y abres el email en el móvil, `localhost` no funcionará: usa un dominio público (Vercel) o un túnel.

## PWA

Hay metadata PWA (manifest + iconos) en `public/manifest.webmanifest`.

- En Android/Chrome: menú → “Instalar aplicación”.
- En iOS/Safari: compartir → “Añadir a pantalla de inicio”.

## Seguridad (RLS)

Es importante activar RLS en Supabase.
Sin RLS, aunque la app filtre por `user_id`, un usuario podría consultar/editar filas de otro usuario llamando a la API directamente.

## Deploy en Vercel

1) Importa el repo en Vercel.
2) Variables de entorno (Project → Settings → Environment Variables):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- (recomendado) `NEXT_PUBLIC_APP_URL` con el dominio de producción

3) Despliega.
4) En Supabase, revisa que **Site URL** y **Redirect URLs** coinciden con el dominio final.

## Troubleshooting

- Veo datos de otros usuarios: ejecuta el bloque **MULTI-USER SAFETY (RLS)** de `database/database.sql`.
- Error de relación `transactions -> categories`: ejecuta el bloque **MIGRATION (existing DB)** en `database/database.sql`.
- El link de recuperar contraseña dice que falta código: Supabase puede mandar el token en otro formato; despliega la versión actual y reintenta.

## Ideas / próximos pasos

- Mejoras UX: accesibilidad, atajos de teclado, validaciones y mensajes de error.
- Tests básicos (smoke) y/o CI.
- Optimización de imágenes en páginas que usan `<img>` (migrar a `next/image`).