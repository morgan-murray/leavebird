import { timingSafeEqual } from "node:crypto";
import { getAffiliateOffer, isAffiliatePlacement } from "@/lib/affiliate-catalog";
import { recordAffiliateConversion } from "@/lib/affiliate-metrics";
import { measuredRoute } from "@/lib/metrics";

export const dynamic = "force-dynamic";

function authorised(request: Request) {
  const expected = process.env.AFFILIATE_POSTBACK_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  return measuredRoute("affiliate", async () => {
    if (!authorised(request)) return Response.json({ error: "Not found" }, { status: 404 });
    let body: {
      conversionId?: string;
      clickEventKey?: string;
      offerId?: string;
      placement?: string;
      commissionMinor?: number;
      currency?: string;
      occurredAt?: string;
    };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid conversion" }, { status: 400 });
    }
    const occurredAt = new Date(body.occurredAt || "");
    const currency = String(body.currency || "").toUpperCase();
    if (!body.conversionId || body.conversionId.length > 256
      || !body.offerId || !getAffiliateOffer(body.offerId)
      || !body.placement || !isAffiliatePlacement(body.placement)
      || !Number.isInteger(body.commissionMinor) || Number(body.commissionMinor) < 0
      || currency !== "GBP" || !Number.isFinite(occurredAt.getTime())
      || (body.clickEventKey && !/^[0-9a-f-]{36}$/i.test(body.clickEventKey))) {
      return Response.json({ error: "Invalid conversion" }, { status: 400 });
    }
    try {
      const created = await recordAffiliateConversion({
        conversionId: body.conversionId,
        clickEventKey: body.clickEventKey,
        offerId: body.offerId,
        placement: body.placement,
        commissionMinor: Number(body.commissionMinor),
        currency,
        occurredAt,
      });
      return Response.json({ accepted: true, duplicate: !created }, { status: created ? 201 : 200 });
    } catch {
      return Response.json({ error: "Conversion unavailable" }, { status: 503 });
    }
  });
}
