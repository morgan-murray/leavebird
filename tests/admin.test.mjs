import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDailyTrend, isConfiguredAdmin, percentile, summariseLatency, summariseTimesheets } from "../lib/admin-core.js";

const adminId = "8b0d55d1-4b81-4c41-9d5a-60db7e2e6ad8";
const otherId = "be03210b-2d6a-4b7d-a064-f4d49af3f714";

test("admin access denies by default and allows only the pinned immutable ID", () => {
  assert.equal(isConfiguredAdmin(undefined, adminId), false, "signed-out visitor");
  assert.equal(isConfiguredAdmin(otherId, adminId), false, "ordinary user");
  assert.equal(isConfiguredAdmin(adminId, adminId), true, "configured owner");
  assert.equal(isConfiguredAdmin(adminId, undefined), false, "missing configuration");
  assert.equal(isConfiguredAdmin(adminId, "morgan@ablench.com"), false, "email cannot become the access rule");
  assert.equal(isConfiguredAdmin(adminId, "not-a-uuid"), false, "invalid configuration");
});

test("latency aggregation reports average and percentiles and handles no data", () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 0.5), 30);
  const summary = summariseLatency([10, 20, 30, 40, 50]);
  assert.equal(summary.count, 5);
  assert.equal(summary.average, 30);
  assert.equal(summary.p50, 30);
  assert.ok(summary.p95 > 40);
  assert.ok(summary.p99 > summary.p95);
  assert.deepEqual(summariseLatency([]), { count: 0, average: null, p50: null, p95: null, p99: null });
});

test("daily trends accept PostgreSQL Date values and fill empty days", () => {
  assert.deepEqual(buildDailyTrend([
    { date: new Date("2026-08-07T09:30:00Z"), value: 2 },
    { date: "2026-08-08", value: 1 },
  ], 3, new Date("2026-08-08T18:00:00Z")), [
    { date: "2026-08-06", value: 0 }, { date: "2026-08-07", value: 2 }, { date: "2026-08-08", value: 1 },
  ]);
});

test("timesheet aggregation counts entries, weeks and submissions without returning content", () => {
  const summary = summariseTimesheets([{
    user_id: adminId,
    data: {
      entries: {
        "2026-08-03": { hours: 8, breakHours: 0.5, note: "Private client detail" },
        "2026-08-04": { start: "09:00", end: "17:00", note: "Another private detail" },
        "2026-08-12": { hours: 7.5, note: "Never return this" },
        "invalid": { hours: 8 },
      },
      submissions: {
        "2026-08-03": { submittedAt: "2026-08-08T12:00:00.000Z" },
      },
      leave: [{ label: "Private holiday", start: "2026-09-01", end: "2026-09-02" }],
    },
  }], new Date("2026-08-13T12:00:00Z"));
  assert.equal(summary.dailyEntries, 3);
  assert.equal(summary.recordedWeeks, 2);
  assert.equal(summary.submittedWeeks, 1);
  assert.equal(summary.usersWithRecordedWeeks, 1);
  assert.equal(summary.averageWeeksPerRecordingUser, 2);
  assert.equal(summary.medianWeeksPerRecordingUser, 2);
  assert.equal(summary.averageWorkdaysPerActiveWeek, 1.5);
  assert.equal(summary.entriesLast7Days, 1);
  assert.equal(summary.entriesLast30Days, 3);
  assert.doesNotMatch(JSON.stringify(summary), /Private|holiday|client/i);
});

test("timesheet aggregation has a stable empty-data state", () => {
  assert.deepEqual(summariseTimesheets([], new Date("2026-08-13T12:00:00Z")), {
    dailyEntries: 0,
    recordedWeeks: 0,
    submittedWeeks: 0,
    usersWithRecordedWeeks: 0,
    averageWeeksPerRecordingUser: 0,
    medianWeeksPerRecordingUser: 0,
    averageWorkdaysPerActiveWeek: 0,
    entriesLast7Days: 0,
    entriesLast30Days: 0,
    submittedLast7Days: 0,
    submittedLast30Days: 0,
  });
});

test("the page, API and response headers all enforce the admin boundary", async () => {
  const [page, api, auth, config, migration, metrics] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/metrics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/003_admin_metrics.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/metrics.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /currentAdmin\(\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(api, /requireAdminApi\(\)/);
  assert.match(auth, /process\.env\.ADMIN_USER_ID/);
  assert.match(config, /Cache-Control.*no-store/s);
  assert.match(config, /X-Robots-Tag.*noindex/s);
  assert.match(migration, /No URLs, query values, user IDs or request bodies/);
  assert.match(metrics, /90 days/);
  assert.match(metrics, /\.catch\(\(\) => undefined\)/);
});
