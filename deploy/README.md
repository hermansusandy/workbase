# WorkBase on UGREEN UGOS Pro

This Compose project runs WorkBase, PostgreSQL, pgAdmin, and Cloudflare Tunnel
in the UGREEN UGOS Pro Docker application on the shared `database_network`.

## Before deployment

1. Revoke the PostgreSQL password and Cloudflare Tunnel token previously shared
   in chat. Create new secrets.
2. Copy `ugreen.env.example` to `ugreen.env` and fill in the new values.
3. In Cloudflare Zero Trust, route the WorkBase hostname to
   `http://workbase:3000`. Do not expose PostgreSQL port `5432` publicly.

## Start

### UGOS Pro interface

1. Open **Docker** in UGOS Pro.
2. Open **Project** and select **Create**.
3. Select this project folder and use `deploy/docker-compose.ugreen.yml`.
4. Add the variables from `deploy/ugreen.env.example` with newly generated
   secret values, then deploy the project.

### SSH alternative

From the repository root on the NAS:

```sh
docker compose --env-file deploy/ugreen.env \
  -f deploy/docker-compose.ugreen.yml up -d --build
```

Open WorkBase on `http://NAS-IP:3000` or through the hostname configured in the
Cloudflare Tunnel. Open pgAdmin separately only on a trusted LAN or behind an
authenticated Cloudflare Access policy.

## Existing PostgreSQL data

The SQL file in `database/postgresql-schema.sql` is automatically applied only
when Bitnami initializes an empty PostgreSQL data directory. If the mounted
database already exists, apply the schema once from pgAdmin before enabling
application persistence.

## Important current limitation

The Docker image runs the current WorkBase interface, but the existing UI still
keeps records in browser memory. `DATABASE_URL` and the PostgreSQL schema are
prepared for the persistence phase; application API/database wiring must be
completed before articles and meeting notes survive a reload.
