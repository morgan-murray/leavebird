import { createSession, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";

type LoginUser = { id: string; email: string; password_hash: string };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const result = await query<LoginUser>("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
  const found = result.rows[0];
  if (!found || !verifyPassword(password, found.password_hash)) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  await createSession(found.id);
  return Response.json({ user: { id: found.id, email: found.email } });
}
