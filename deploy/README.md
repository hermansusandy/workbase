# WorkBase on UGREEN UGOS Pro

This deployment is designed for the UGOS Pro graphical Docker interface. It
does not require SSH, terminal commands, a local source folder, or an external
environment file. Docker downloads the WorkBase source directly from GitHub and
builds the image on the NAS.

## Prerequisites

- The existing `postgres_db` container is running.
- The external Docker network `database_network` already exists.
- The UGREEN NAS has internet access to GitHub, npm, and Docker Hub.
- The previously exposed PostgreSQL password and Cloudflare Tunnel token have
  been revoked and replaced.

## Deploy in UGOS Pro

1. Open **Docker**.
2. Open **Project** and select **Create**.
3. Import `deploy/docker-compose.ugreen.yml`, or paste its complete contents.
4. In the Compose editor, replace `CHANGE_DATABASE_PASSWORD` with the new
   PostgreSQL password. URL-encode reserved characters in the password.
5. Replace `CHANGE_CLOUDFLARE_TUNNEL_TOKEN` with the new Tunnel token.
6. Click **Deploy**. The first build downloads dependencies and may take several
   minutes.
7. Open the WorkBase container log in UGOS Pro. A successful startup ends with
   `Production server running at http://0.0.0.0:3000`.

Open WorkBase at `http://NAS-IP:3000`. Configure the Cloudflare public hostname
to use `http://workbase:3000` as its service URL.

## Updating

Rebuild/redeploy the project in UGOS Pro. Docker will fetch the latest source
from the GitHub branch configured in `build.context`.

## Important current limitation

The container receives `DATABASE_URL`, but the current WorkBase UI still keeps
records in browser memory. The PostgreSQL-backed API must be implemented before
articles and meeting notes survive a browser refresh.
