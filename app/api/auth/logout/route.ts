import { destroySession } from "@/lib/auth";
import { measuredRoute } from "@/lib/metrics";

export async function POST() {
  return measuredRoute("authentication", async () => {
    await destroySession();
    return Response.json({ ok: true });
  });
}
