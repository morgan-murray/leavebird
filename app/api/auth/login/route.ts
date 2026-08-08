import { createSession, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { measuredRoute, recordOperationalEvent } from "@/lib/metrics";

type LoginUser = { id: string; email: string; password_hash: string | null };

export async function POST(request: Request) {
  return measuredRoute("authentication", async () => {
    const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
    const email = body?.email?.trim().toLowerCase() ?? "";
    const password = body?.password ?? "";
    const result = await query<LoginUser>("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
    const found = result.rows[0];
    if (!found?.password_hash || !verifyPassword(password, found.password_hash)) {
      recordOperationalEvent("login", false);
      return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    await createSession(found.id);
    recordOperationalEvent("login", true);
    return Response.json({ user: { id: found.id, email: found.email } });
  });
}
