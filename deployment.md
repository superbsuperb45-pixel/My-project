# Deployment

LeadRescue is a single Node process with a SQLite database. Any host that gives you a
persistent disk works. Serverless platforms with an ephemeral filesystem (Vercel/Netlify
function directories) are **not** suitable for the SQLite file — deploy to a container or VM.

## Required for production

| Variable | Example |
| --- | --- |
| `APP_URL` | `https://leadrescue.yourdomain.com` (no trailing slash) |
| `DATABASE_PATH` | `/data/leadrescue.db` (a mounted persistent volume) |
| `SECURE_COOKIES` | `true` |
| `GOOGLE_SITE_VERIFICATION` | token from Search Console (optional) |

Put the app behind HTTPS (the platform terminates TLS). Never expose port 3000 directly
without a TLS proxy.

## Docker

```bash
docker build -t leadrescue .
docker run -d --name leadrescue -p 3000:3000 \
  -v leadrescue-data:/data \
  -e APP_URL=https://leadrescue.example.com \
  -e DATABASE_PATH=/data/leadrescue.db \
  -e SECURE_COOKIES=true \
  leadrescue
```

`Dockerfile` uses `node:24-alpine`, a non-root user, and a `/data` volume.

## Render

1. Push this directory to a Git repository.
2. Create a **Web Service** from the repo — `render.yaml` in the root configures the build,
   start command and a 1 GB disk at `/data`.
3. Set `APP_URL` to the assigned domain (or your custom domain) and redeploy.
4. Add the custom domain, wait for the certificate, then run the Search Console checklist in
   `docs/seo-search-console.md`.

## Fly.io

```bash
fly launch --no-deploy            # accepts the Dockerfile
fly volumes create leadrescue_data --size 1
fly secrets set APP_URL=https://your-app.fly.dev DATABASE_PATH=/data/leadrescue.db SECURE_COOKIES=true
fly deploy
```

## Any Node host / VM

```bash
DATABASE_PATH=/var/lib/leadrescue/leadrescue.db PORT=3000 \
APP_URL=https://leadrescue.example.com SECURE_COOKIES=true node server.js
```

Put a reverse proxy (Caddy/nginx) in front for HTTPS and run the process under a supervisor
(systemd, pm2) so it restarts after a reboot.

## Backups

The database is a single file plus `-wal`/`-shm`. Copy all three while the process is stopped,
or use `sqlite3 /data/leadrescue.db ".backup /data/backup.db"` online. Keep the `data/`
directory readable only by the service user — it contains customer records.

## Scaling notes

- Reads are cheap; SQLite in WAL mode handles a normal SMB workload comfortably.
- For multiple app instances, replace `src/db.js` with a networked database driver. Every
  query already goes through the `one/all/run/tx` helpers, and all tenant data is scoped by
  `org_id`.
- The recovery engine tick runs inside each process. With multiple instances, either run the
  tick on one instance (`ENGINE_INTERVAL_MS=0` elsewhere; rules still evaluate on queue reads)
  or move it to a scheduled job calling `POST /api/recovery/run` with an authenticated session.

## Post-deploy smoke test

```bash
curl -s https://your-domain/ | grep -o '<title>[^<]*</title>'
curl -s https://your-domain/robots.txt
curl -s https://your-domain/sitemap.xml | head -5
curl -s -o /dev/null -w "%{http_code}\n" https://your-domain/signup
curl -s https://your-domain/ | grep -o '<meta name="google-site-verification"[^>]*>' || echo "no verification tag set"
```

Then create a workspace, add a lead, and confirm it survives a restart (persistence check).
