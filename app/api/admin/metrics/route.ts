import { requireAdminApi } from "@/lib/admin-auth";
import { getAdminDashboardData } from "@/lib/admin-metrics";
import { measuredRoute } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return measuredRoute("admin", async () => {
    const access = await requireAdminApi();
    if (access.response) return access.response;
    const params = new URL(request.url).searchParams;
    const metrics = await getAdminDashboardData(new Date(), {
      days: Number(params.get("days")) || 30,
      placement: params.get("placement") || "",
      merchant: params.get("merchant") || "",
    });
    return Response.json(metrics, {
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  });
}
