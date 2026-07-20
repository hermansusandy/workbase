# WorkBase on UGREEN UGOS Pro

This deployment is designed for the UGOS Pro graphical Docker interface. It
does not require SSH, terminal commands, Git, a local source folder, or an
external environment file. UGOS Pro pulls the ready-made WorkBase image from
GitHub Container Registry.

## Prerequisites

- The existing `postgres_db` container is running.
- The external Docker network `database_network` already exists.
- The UGREEN NAS has internet access to GitHub Container Registry and Docker Hub.
- The previously exposed PostgreSQL password and Cloudflare Tunnel token have
  been revoked and replaced in their existing projects.

## Deploy in UGOS Pro

1. Open **Docker**.
2. Open **Project** and select **Create**.
3. Import `deploy/docker-compose.ugreen.yml`, or paste its complete contents.
4. In the Compose editor, replace `CHANGE_DATABASE_PASSWORD` with the new
   PostgreSQL password. URL-encode reserved characters in the password.
5. Replace `CHANGE_CLOUDFLARE_TUNNEL_TOKEN` with the WorkBase Tunnel token.
6. Click **Deploy**. UGOS Pro downloads the prebuilt WorkBase image.
7. Open the WorkBase container log in UGOS Pro. A successful startup ends with
   `Production server running at http://0.0.0.0:3000`.

Open WorkBase at `http://NAS-IP:3001`. The WorkBase-specific Cloudflare
container is named `workbase-cloudflared` and reaches the application at
`http://workbase:3000`.

## Updating

Recreate/redeploy the project in UGOS Pro. Docker will pull the latest WorkBase
image from GitHub Container Registry because `pull_policy` is set to `always`.

## Important current limitation

The container receives `DATABASE_URL`, but the current WorkBase UI still keeps
records in browser memory. The PostgreSQL-backed API must be implemented before
articles and meeting notes survive a browser refresh.
