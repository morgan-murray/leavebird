import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isLikelyBot, summariseAffiliate } from "../lib/affiliate-core.js";

test("summarises and filters recommendation performance", () => {
  const now = new Date("2026-08-09T12:00:00Z");
  const events = [
    { recorded_at: "2026-08-08", event_type: "impression", placement: "weekend-board", merchant: "Wowcher" },
    { recorded_at: "2026-08-08", event_type: "impression", placement: "weekend-board", merchant: "Wowcher" },
    { recorded_at: "2026-08-08", event_type: "click", placement: "weekend-board", merchant: "Wowcher" },
    { recorded_at: "2026-08-08", event_type: "impression", placement: "holiday-board", merchant: "HolidayPirates" },
    { recorded_at: "2026-06-01", event_type: "click", placement: "weekend-board", merchant: "Wowcher" },
  ];
  const conversions = [
    { occurred_at: "2026-08-08", placement: "weekend-board", merchant: "Wowcher", commission_minor: 850 },
  ];
  const report = summariseAffiliate(events, conversions, { days: 30, placement: "weekend-board", now });
  assert.equal(report.impressions, 2);
  assert.equal(report.clicks, 1);
  assert.equal(report.clickThroughRate, 50);
  assert.equal(report.conversions, 1);
  assert.equal(report.conversionRate, 100);
  assert.equal(report.commissionMinor, 850);
  assert.equal(report.earningsPerClickMinor, 850);
  assert.deepEqual(report.availableMerchants, ["HolidayPirates", "Wowcher"]);
});

test("returns a stable empty report and recognises common bots", () => {
  const report = summariseAffiliate([], [], { days: 30, now: new Date("2026-08-09T12:00:00Z") });
  assert.equal(report.clickThroughRate, 0);
  assert.equal(report.conversionRate, 0);
  assert.equal(report.earningsPerClickMinor, 0);
  assert.equal(isLikelyBot("Googlebot/2.1"), true);
  assert.equal(isLikelyBot("Mozilla/5.0 Safari/605.1.15"), false);
});

test("affiliate reporting is anonymous, deduplicated and failure safe", async () => {
  const [migration, eventRoute, redirectRoute, conversionRoute, tracker, dashboard, policy] = await Promise.all([
    readFile(new URL("../db/migrations/004_affiliate_reporting.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/affiliate/events/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/go/[offerId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/affiliate/conversions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/TrackedOfferLink.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/affiliate-reporting.md", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(migration, /user_id|ip_address|email/i);
  assert.match(migration, /PRIMARY KEY/);
  assert.match(migration, /one-way hashed/);
  assert.match(eventRoute, /requireUser\(\)/);
  assert.match(eventRoute, /isLikelyBot/);
  assert.match(redirectRoute, /reporting failure must never stop/i);
  assert.match(redirectRoute, /NextResponse\.redirect/);
  assert.match(conversionRoute, /AFFILIATE_POSTBACK_SECRET/);
  assert.match(conversionRoute, /timingSafeEqual/);
  assert.match(tracker, /intersectionRatio >= 0\.5/);
  assert.match(tracker, /750/);
  assert.match(dashboard, /name="days"/);
  assert.match(dashboard, /name="placement"/);
  assert.match(dashboard, /name="merchant"/);
  assert.match(policy, /No advertising cookies/i);
  assert.match(policy, /account deletion/i);
});
