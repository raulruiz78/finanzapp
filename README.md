# FinanzApp (PWA)

PWA instalable (sin App Store) para finanzas tipo Excel:
- Movimientos por mes
- Resumen por cuenta (Mes anterior / Inicio / Fin / Ahorro)
- Persistencia local (IndexedDB via Dexie)
- Offline básico (service worker)

## Estructura

```
finanzapp/
	app/
		layout.tsx
		page.tsx
		globals.css
	lib/
		db.ts
		calc.ts
	public/
		manifest.webmanifest
		sw.js
		icons/
			icon-192.png
			icon-512.png
	next.config.mjs
	package.json
	tsconfig.json
	.gitignore
	README.md
```

# FinanzApp

Aplicación web de finanzas personales (Next.js + Supabase) pensada para uso diario:

- Login con email/contraseña
- Cuentas con saldo inicial
- Categorías (plantillas) con dirección (Ingreso/Gasto) e importe
- Movimientos del mes (fijos por plantilla + variables)
- Transferencias entre cuentas
- Resumen mensual con cierre (locking) por cuenta

## Stack

- Next.js 14 (App Router) + React + TypeScript
- Supabase:
  - Auth (email/password, confirmación por email, recuperación de contraseña)
  - Postgres + PostgREST

## Requisitos

- Node.js 18+
- Una cuenta/proyecto en Supabase

## Arrancar en local

1) Instalar dependencias

```bash
npm install
```

2) Configurar variables de entorno

Crea el archivo `.env.local` en la raíz del repo con:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY

# Opcional: URL pública donde vive la app (recomendado para enlaces de email)
# NEXT_PUBLIC_APP_URL=https://finanzapp-delta.vercel.app
```

3) Ejecutar

```bash
npm run dev
```

Abre http://localhost:3000

## Scripts útiles

```bash
npm run dev      # desarrollo
npm run build    # build producción
npm run start    # servir build (requiere build)
npm run lint     # lint
```

## Base de datos (Supabase)

El esquema y migraciones viven en:

- `database/database.sql`

### Opción A — Proyecto nuevo (recomendado)

1) Crea un proyecto en Supabase.
2) En Supabase → SQL Editor, ejecuta el bloque **SCHEMA (fresh install only)** de `database/database.sql`.
3) Ejecuta también el bloque **MULTI-USER SAFETY (RLS)** (si no lo has incluido ya).

### Opción B — Proyecto ya existente

En Supabase → SQL Editor, ejecuta el bloque **MIGRATION (existing DB)** de `database/database.sql`.

Ese bloque hace dos cosas importantes:

1) Asegura la relación necesaria para que PostgREST pueda hacer el join `transactions -> categories`.
2) Activa **RLS (Row Level Security)** y crea policies para que cada usuario sólo vea y modifique sus propios datos.

### Por qué es clave activar RLS

Sin RLS, aunque la app filtre por `user_id`, un usuario podría consultar/editar filas de otro usuario llamando a la API directamente.
Con RLS, Supabase aplica la seguridad en la base de datos.

## Configuración de Auth (Supabase)

En Supabase → Authentication → URL Configuration:

- **Site URL**: tu dominio principal (por ejemplo `https://finanzapp-delta.vercel.app`)
- **Additional Redirect URLs**: añade estos endpoints:
  - `https://TU-DOMINIO/auth/callback` (confirmación email / OAuth callback)
  - `https://TU-DOMINIO/auth/reset` (recuperación de contraseña)

Notas:

- Los enlaces de recuperación/confirmación pueden venir como `?code=...`, `?token_hash=...&type=...` o en el hash `#access_token=...`. La app soporta los tres.
- Si pruebas en local y abres el email en el móvil, `localhost` no funcionará. Para pruebas reales usa el dominio de Vercel o un túnel.

## Deploy en Vercel

1) Importa el repo en Vercel.
2) Configura las variables de entorno en Vercel (Project → Settings → Environment Variables):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- (opcional) `NEXT_PUBLIC_APP_URL` con el dominio de producción

3) Despliega.
4) Vuelve a Supabase y asegúrate de que **Site URL** y **Redirect URLs** coinciden con el dominio final.

## Funcionalidades (versión actual)

- **Login**: registro, login, confirmación por email, recuperar contraseña.
- **Cuentas**: crear/borrar cuentas y ver saldo vivo.
- **Categorías**: plantillas por dirección (Ingreso/Gasto), ocultando categorías internas.
- **Movimientos**: alta rápida de fijos desde plantillas y alta de variables por dirección.
- **Transferencias**: entre cuentas, sin crear categorías “especiales” visibles.
- **Mensual**: resumen por cuenta, definir saldo inicial del mes, cerrar/desbloquear mes.

## Troubleshooting

- **Veo datos de otros usuarios**: ejecuta el bloque **MULTI-USER SAFETY (RLS)** de `database/database.sql` en tu Supabase.
- **Error de relación transactions → categories**: ejecuta el bloque **MIGRATION (existing DB)** (incluye creación de FK) en `database/database.sql`.
- **El link de recuperar contraseña dice que falta código**: Supabase puede mandar el token en otro formato; despliega la versión actual y reenvía el email.