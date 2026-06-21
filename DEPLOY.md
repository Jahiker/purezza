# Deploy (CI/CD)

Este theme se despliega a producción automáticamente con **GitHub Actions**:
cada `push` a `main` sincroniza el theme al VPS por `rsync` sobre SSH.

```
push a main ─▶ GitHub Actions ─▶ rsync ─▶ /var/www/html/wp-content/themes/hello-theme-child-master
```

## Puesta en marcha (una sola vez)

### 1. Crear el repo en GitHub y subir este theme
```bash
# desde la carpeta del theme
gh repo create purezza-theme --private --source=. --remote=origin --push
# o, si no usas gh: crea el repo vacío en github.com y luego:
#   git remote add origin git@github.com:TU_USUARIO/purezza-theme.git
#   git push -u origin main
```

### 2. Configurar los Secrets del repo
En GitHub → **Settings → Secrets and variables → Actions → New repository secret**, crea:

| Secret | Valor |
|---|---|
| `VPS_HOST` | `148.230.81.150` |
| `VPS_USER` | `ubuntu` |
| `VPS_THEME_PATH` | `/var/www/html/wp-content/themes/hello-theme-child-master` |
| `VPS_SSH_KEY` | contenido **completo** de la clave privada de deploy (ver abajo) |

La clave privada de deploy ya está generada en tu máquina en `~/.ssh/purezza-deploy`
(su pública ya está autorizada en el VPS). Para copiarla al portapapeles:
```bash
pbcopy < ~/.ssh/purezza-deploy   # macOS — pega esto en el secret VPS_SSH_KEY
```

### 3. Listo
A partir de ahí, cada `push` a `main` despliega. También puedes lanzarlo a mano
desde la pestaña **Actions → Deploy theme to production → Run workflow**.

## Qué hace y qué NO hace

- ✅ Despliega el **código del theme** (PHP, CSS, JS, ACF JSON, fuentes).
- ✅ `--delete`: el theme en prod queda idéntico al repo (fuente de verdad).
- ❌ **No** toca la base de datos, contenido ACF, posts ni `uploads/` — eso es
  contenido y se gestiona aparte (admin de WordPress / migración manual).

## Flujo de trabajo sugerido
- Trabaja en ramas + Pull Request; protege `main` para que todo pase por PR.
- El historial de git permite **detectar inyecciones de malware** en `functions.php`
  con un simple diff (este sitio tuvo ese problema antes).

## Rollback
- `git revert <commit>` + push → Actions redespliega la versión anterior.
- Backups del VPS: `~/backup-pre-catalogo-2026-06-21.sql` y `~/backup-childtheme-*.tgz`.
