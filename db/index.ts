// Docker/PostgreSQL database entry point.
// Keep server-side database access behind this module so the application does
// not import the Cloudflare-only `cloudflare:workers` protocol in Node.js.
export { ensureDatabase, sql as getDb } from "../lib/postgres";
