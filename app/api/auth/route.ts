import { currentUser, login, logout } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  return Response.json({ authenticated: Boolean(user), user });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const user = await login(body.email?.trim() || "", body.password || "");
    if (!user) return Response.json({ error: "Email atau password salah." }, { status: 401 });
    return Response.json({ authenticated: true, user });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Login gagal." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  await logout();
  return Response.json({ authenticated: false });
}
