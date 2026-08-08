import { currentUser } from "@/lib/auth";
import { isConfiguredAdmin } from "@/lib/admin-core.js";
import { measuredRoute, recordUserActivity } from "@/lib/metrics";

export async function GET() {
  return measuredRoute("page", async () => {
    const account = await currentUser();
    if (account) recordUserActivity(account.id, "authenticated-visit");
    const user = account ? { ...account, isAdmin: isConfiguredAdmin(account.id, process.env.ADMIN_USER_ID) } : null;
    return Response.json({ user });
  });
}
