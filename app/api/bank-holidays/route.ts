import { measuredRoute, recordOperationalEvent } from "@/lib/metrics";

type GovEvent = { title?: unknown; date?: unknown };
type GovDivision = { events?: unknown };

const divisions = ["england-and-wales", "scotland", "northern-ireland"] as const;

export async function GET() {
  return measuredRoute("bank-holidays", async () => {
  try {
    const response = await fetch("https://www.gov.uk/bank-holidays.json", {
      headers: { Accept: "application/json" },
      next: { revalidate: 21_600 },
    });
    if (!response.ok) throw new Error(`GOV.UK returned ${response.status}`);
    const source = await response.json() as Record<string, GovDivision>;
    const result = Object.fromEntries(divisions.map(division => {
      const rawEvents = Array.isArray(source[division]?.events) ? source[division].events as GovEvent[] : [];
      const events = rawEvents.flatMap(event => typeof event.title === "string" && typeof event.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.date) ? [{ title: event.title, date: event.date }] : []);
      return [division, events];
    }));
    recordOperationalEvent("bank-holiday-fetch", true);
    return Response.json({ divisions: result, source: "GOV.UK" }, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
  } catch {
    recordOperationalEvent("bank-holiday-fetch", false);
    return Response.json({ error: "Bank holiday dates are temporarily unavailable." }, { status: 502 });
  }
  });
}
