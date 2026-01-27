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

## Requisitos
- Node 18+ (recomendado)
- npm

## Ejecutar en local

```bash
npm install
npm run dev
```

Abre http://localhost:3000

## Supabase (SQL / migraciones)

Si usas Supabase como backend, algunas mejoras de UX requieren pequeñas migraciones (por ejemplo, soportar "movimientos fijos" con importe por defecto).

Ver: [docs/supabase-migrations.md](docs/supabase-migrations.md)

## Commit y push (GitHub)

Si ya tienes el repo creado en GitHub:

```bash
git add .
git commit -m "Inicial: PWA FinanzApp con IndexedDB (Dexie) y resumen tipo Excel"
git push -u origin main
```

Si clonas un repo vacío:

```bash
git clone https://github.com/raulruiz78/finanzapp.git
cd finanzapp
```

Si el `git push` falla con error 128, suele ser por autenticación/permisos (HTTPS sin token, o falta de acceso). Opciones típicas:
- Autenticación con GitHub CLI: `gh auth login`
- Cambiar a SSH: `git remote set-url origin git@github.com:raulruiz78/finanzapp.git` (y configurar tu clave SSH)

## iPhone / iOS (PWA real)

Para instalar en iOS necesitas servirlo por HTTPS (localhost no vale en el iPhone).

Lo más cómodo: desplegar en Vercel (gratis) o Netlify.

En iPhone:
1. Abre la URL en Safari
2. Compartir → Añadir a pantalla de inicio

## Backup (siguiente mejora recomendada)

Ahora mismo los datos no se pierden en ese dispositivo, pero si cambias de móvil, pierdes el IndexedDB. Lo normal es añadir:
- Export/Import JSON (backup manual)
- o Sync (Drive/iCloud/API)_

A ver, vamos a hacer un cambio grandre, esto es web, pero lo que quiero es otra cosa, vamos a rehacer esto entero. 

yo quiero un app, que sea comoda de usar. Para ello queremos un login, con cuenta y usuario para memoria. 

una vez tenemos esto, El usuario añadirá una cuenta, indicando el dinero actual de esta cuenta.

el usuario puede añadir tantas cuentas como quiera y posteriormente podria borrarlas tambien desde ajuste de sus cuentas.

una vez tiene eso, ya cada usuario cada mes podra ir añaddiendo los tipos de movimiento en las cuentas que desee, siguiendo los tipos que indique antes. 

Sabuendo esto, se ira recalculando el con cuanto inicial el mes, lo que se estima con los gastos añadidos, y si hay un gasto variable, el ajuste nuevo en esa cuenta 