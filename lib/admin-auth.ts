import { currentUser } from "./auth";
import { isConfiguredAdmin } from "./admin-core.js";
import { recordOperationalEvent } from "./metrics";

export type AdminUser = { id: string; email: string };

export async function currentAdmin(): Promise<AdminUser | null> {
  const user = await currentUser();
  const allowed = isConfiguredAdmin(user?.id, process.env.ADMIN_USER_ID);
  recordOperationalEvent("admin-access", allowed);
  return allowed && user ? user : null;
}

export async function requireAdminApi() {
  const admin = await currentAdmin();
  if (!admin) {
    return {
      admin: null,
      response: Response.json({ error: "Not found" }, {
        status: 404,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
      }),
    };
  }
  return { admin, response: null };
}
