import { currentUser } from "@/lib/auth";
import { ensureDatabase, sql } from "@/lib/postgres";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await currentUser())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return Response.json({ error: "Missing key" }, { status: 400 });
  await ensureDatabase();
  const rows = await sql()`SELECT value FROM workbase_state WHERE state_key = ${key}`;
  return Response.json({ found: Boolean(rows[0]), value: rows[0]?.value ?? null });
}

export async function PUT(request: Request) {
  if (!(await currentUser())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { key?: string; value?: unknown };
  if (!body.key) return Response.json({ error: "Missing key" }, { status: 400 });
  await ensureDatabase();
  await sql()`
    INSERT INTO workbase_state (state_key, value, updated_at)
    VALUES (${body.key}, ${sql().json(body.value)}, now())
    ON CONFLICT (state_key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  return Response.json({ saved: true });
}
