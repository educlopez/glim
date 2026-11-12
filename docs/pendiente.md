# Pendiente

Cosas decididas en principio pero aparcadas. No se hacen hasta que Edu lo pida.

## Nombre (abierto, 2026-11-12)

"Moss" no convence. Antes de salir en público hay que elegir otro y renombrar:

- repo de GitHub, `name` y `productName` de `package.json`, `appId` (bundle id)
- carpeta de datos (`~/Library/Application Support/<Nombre>`) y de registros (`~/Library/Logs/<Nombre>`), con migración desde la de Moss
- `moss.config.json` → `<nombre>.config.json` (aceptar el viejo un tiempo), `.moss/` → `.<nombre>/`
- variables `MOSS_*`, cookie `moss_token`, cabecera `x-moss-token`, rama `moss/…` de «Publicar cambios»
- icono (`electron/Moss.icon`), textos de `src/locales/`, README y `docs/`
- en marca-personal: `moss.config.json`, `AGENTS.md` (paso 7) y `.github/workflows/cerebro.yml`

## Landing (aparcada, 2026-11-12)

Una página propia en un subdominio del portfolio, como hace Pond con `pond.raphaelsalaja.com`. Sin dominio propio por ahora.

- DNS de `educalvolopez.com` en Cloudflare: registro CNAME `<nombre>` → `cname.vercel-dns.com` (sin proxy)
- proyecto nuevo en Vercel con ese dominio; previews desactivadas (proyecto pequeño)
- OG estática y animada con la skill `og-animada`
- requisito previo: nombre elegido y repo público (hoy sigue privado)
