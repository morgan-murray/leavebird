import { createHash } from "node:crypto";
import { getAffiliateOffer, type AffiliatePlacement } from "./affiliate-catalog";
import { query } from "./db";

let lastAffiliateCleanup = 0;
export const affiliateRetentionDays = 395;

async function cleanupAffiliateMetricsIfDue() {
  if (Date.now() - lastAffiliateCleanup < 24 * 60 * 60 * 1000) return;
  lastAffiliateCleanup = Date.now();
  await Promise.all([
    query("DELETE FROM affiliate_events WHERE recorded_at < NOW() - INTERVAL '395 days'"),
    query("DELETE FROM affiliate_conversions WHERE occurred_at < NOW() - INTERVAL '395 days'"),
  ]);
}

export async function recordAffiliateEvent(input: {
  eventKey: string;
  eventType: "impression" | "click";
  offerId: string;
  placement: AffiliatePlacement;
}) {
  const offer = getAffiliateOffer(input.offerId);
  if (!offer) throw new Error("Unknown offer");
  const result = await query(
    `INSERT INTO affiliate_events (event_key, event_type, placement, offer_id, merchant)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (event_key) DO NOTHING
     RETURNING event_key`,
    [input.eventKey, input.eventType, input.placement, offer.id, offer.merchant],
  );
  void cleanupAffiliateMetricsIfDue().catch(() => undefined);
  return result.rowCount === 1;
}

export async function recordAffiliateConversion(input: {
  conversionId: string;
  clickEventKey?: string | null;
  offerId: string;
  placement: AffiliatePlacement;
  commissionMinor: number;
  currency: string;
  occurredAt: Date;
}) {
  const offer = getAffiliateOffer(input.offerId);
  if (!offer) throw new Error("Unknown offer");
  const referenceHash = createHash("sha256").update(`${offer.merchant}\u0000${input.conversionId}`).digest("hex");
  const result = await query(
    `INSERT INTO affiliate_conversions
      (conversion_key_hash, occurred_at, click_event_key, placement, offer_id, merchant, commission_minor, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (conversion_key_hash) DO NOTHING
     RETURNING conversion_key_hash`,
    [referenceHash, input.occurredAt, input.clickEventKey || null, input.placement, offer.id, offer.merchant, input.commissionMinor, input.currency],
  );
  void cleanupAffiliateMetricsIfDue().catch(() => undefined);
  return result.rowCount === 1;
}
