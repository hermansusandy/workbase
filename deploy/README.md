# WorkBase on Synology Docker

This Compose stack runs WorkBase, PostgreSQL, pgAdmin, and Cloudflare Tunnel on
the shared `database_network` network.

## Before deployment

1. Revoke the PostgreSQL password and Cloudflare Tunnel token previously shared
   in chat. Create new secrets.
2. Copy `synology.env.example` to `synology.env` and fill in the new values.
3. In Cloudflare Zero Trust, route the WorkBase hostname to
   `http://workbase:3000`. Do not expose PostgreSQL port `5432` publicly.

## Start

From the repository root:

```sh
docker compose --env-file deploy/synology.env \
  -f deploy/docker-compose.synology.yml up -d --build
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
