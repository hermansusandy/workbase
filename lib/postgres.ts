import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;
let initialized: Promise<void> | null = null;

export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  client ??= postgres(url, { max: 5, idle_timeout: 20 });
  return client;
}

export function ensureDatabase() {
  initialized ??= (async () => {
    const db = sql();
    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS workbase_users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS workbase_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES workbase_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS workbase_state (
        state_key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  })();
  return initialized;
}
