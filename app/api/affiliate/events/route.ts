import { isAffiliatePlacement, getAffiliateOffer } from "@/lib/affiliate-catalog";
import { isLikelyBot } from "@/lib/affiliate-core.js";
import { recordAffiliateEvent } from "@/lib/affiliate-metrics";
import { requireUser } from "@/lib/auth";
import { measuredRoute } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return measuredRoute("affiliate", async () => {
    const user = await requireUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    if (isLikelyBot(request.headers.get("user-agent") || "")) return new Response(null, { status: 204 });
    let body: { eventKey?: string; offerId?: string; placement?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid event" }, { status: 400 });
    }
    if (!body.eventKey || !/^[0-9a-f-]{36}$/i.test(body.eventKey)
      || !body.offerId || !getAffiliateOffer(body.offerId)
      || !body.placement || !isAffiliatePlacement(body.placement)) {
      return Response.json({ error: "Invalid event" }, { status: 400 });
    }
    try {
      const created = await recordAffiliateEvent({
        eventKey: body.eventKey,
        eventType: "impression",
        offerId: body.offerId,
        placement: body.placement,
      });
      return Response.json({ accepted: true, duplicate: !created }, { status: created ? 201 : 200 });
    } catch {
      return Response.json({ accepted: false }, { status: 202 });
    }
  });
}
