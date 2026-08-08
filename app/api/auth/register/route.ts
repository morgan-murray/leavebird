import { createSession, hashPassword } from "@/lib/auth";
import { isConfiguredAdmin } from "@/lib/admin-core.js";
import { query } from "@/lib/db";
import { measuredRoute, recordOperationalEvent } from "@/lib/metrics";

type CreatedUser = { id: string; email: string };

export async function POST(request: Request) {
  return measuredRoute("authentication", async () => {
    const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
    const email = body?.email?.trim().toLowerCase() ?? "";
    const password = body?.password ?? "";
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      recordOperationalEvent("registration", false);
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 10) {
      recordOperationalEvent("registration", false);
      return Response.json({ error: "Use at least 10 characters for your password." }, { status: 400 });
    }
    try {
      const result = await query<CreatedUser>("INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email", [email, hashPassword(password)]);
      const user = result.rows[0];
      await createSession(user.id);
      recordOperationalEvent("registration", true);
      return Response.json({ user: { ...user, isAdmin: isConfiguredAdmin(user.id, process.env.ADMIN_USER_ID) } }, { status: 201 });
    } catch (error: unknown) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        recordOperationalEvent("registration", false);
        return Response.json({ error: "An account with that email already exists." }, { status: 409 });
      }
      throw error;
    }
  });
}
