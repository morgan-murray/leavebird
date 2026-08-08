import { requireAdminApi } from "@/lib/admin-auth";
import { getAdminDashboardData } from "@/lib/admin-metrics";
import { measuredRoute } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  return measuredRoute("admin", async () => {
    const access = await requireAdminApi();
    if (access.response) return access.response;
    const metrics = await getAdminDashboardData();
    return Response.json(metrics, {
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  });
}
