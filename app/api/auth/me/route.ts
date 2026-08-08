import { currentUser } from "@/lib/auth";
import { measuredRoute, recordUserActivity } from "@/lib/metrics";

export async function GET() {
  return measuredRoute("page", async () => {
    const user = await currentUser();
    if (user) recordUserActivity(user.id, "authenticated-visit");
    return Response.json({ user });
  });
}
