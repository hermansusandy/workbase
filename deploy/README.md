# WorkBase on UGREEN UGOS Pro

This deployment follows the existing UGREEN setup: PostgreSQL and pgAdmin stay
in their current Compose project, while WorkBase and Cloudflare Tunnel run in a
separate project attached to the external `database_network`.

## Security first

Revoke the database password and Cloudflare Tunnel token previously shared in
chat. Generate replacements and keep them only in `deploy/ugreen.env`. Never
commit that file.

## Prepare the application folder

Connect to the NAS over SSH and run:

```sh
mkdir -p /volume1/docker/workbase
cd /volume1/docker/workbase
git clone --branch agent/docker-synology \
  https://github.com/hermansusandy/workbase.git .
cp deploy/ugreen.env.example deploy/ugreen.env
```

Edit `deploy/ugreen.env` and set the new database password and Tunnel token.
If the password contains characters such as `@`, `:`, `/`, `#`, or `%`, URL
encode those characters in `DATABASE_URL`.

Confirm that the existing database network is available:

```sh
docker network inspect database_network
```

## Deploy over SSH

```sh
docker compose --env-file deploy/ugreen.env \
  -f deploy/docker-compose.ugreen.yml up -d
```

The first start installs dependencies and builds the application, so it can
take several minutes. Follow progress with:

```sh
docker logs -f workbase
```

Open WorkBase at `http://NAS-IP:3000`. In Cloudflare Zero Trust, route the
WorkBase public hostname to `http://workbase:3000`.

## Update WorkBase

```sh
cd /volume1/docker/workbase
git pull
docker compose --env-file deploy/ugreen.env \
  -f deploy/docker-compose.ugreen.yml restart workbase
```

## Important current limitation

The container receives `DATABASE_URL`, but the current WorkBase UI still keeps
records in browser memory. The PostgreSQL-backed API must be implemented before
articles and meeting notes survive a browser refresh.
