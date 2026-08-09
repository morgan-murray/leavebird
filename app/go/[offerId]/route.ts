import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAffiliateOffer, isAffiliatePlacement } from "@/lib/affiliate-catalog";
import { isLikelyBot } from "@/lib/affiliate-core.js";
import { recordAffiliateEvent } from "@/lib/affiliate-metrics";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await context.params;
  const offer = getAffiliateOffer(offerId);
  if (!offer) return NextResponse.redirect(new URL("/", request.url), 302);
  const placementValue = new URL(request.url).searchParams.get("placement") || "";
  if (!isAffiliatePlacement(placementValue)) return NextResponse.redirect(offer.destination, 302);

  try {
    const user = await currentUser();
    if (user && !isLikelyBot(request.headers.get("user-agent") || "")) {
      await Promise.race([
        recordAffiliateEvent({
          eventKey: randomUUID(),
          eventType: "click",
          offerId,
          placement: placementValue,
        }),
        new Promise(resolve => setTimeout(resolve, 150)),
      ]);
    }
  } catch {
    // A reporting failure must never stop someone opening an offer.
  }
  return NextResponse.redirect(offer.destination, 302);
}
