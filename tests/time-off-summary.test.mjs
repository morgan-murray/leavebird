import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { countBookedLeaveDays } from "../lib/time-off-summary.js";

const leave = [
  { id: "annual-a", start: "2026-08-03", end: "2026-08-07", label: "Summer", type: "annual" },
  { id: "annual-overlap", start: "2026-08-07", end: "2026-08-10", label: "Overlap", type: "annual" },
  { id: "flexi-a", start: "2026-08-14", end: "2026-08-17", label: "Flexi", type: "flexi" },
  { id: "legacy", start: "2026-08-24", end: "2026-08-24", label: "Legacy" },
];

test("counts unique annual-leave weekdays and treats legacy bookings as annual", () => {
  const result = countBookedLeaveDays({ leave, type: "annual", startKey: "2026-08-01", endKey: "2026-08-31" });
  assert.equal(result, 7);
});

test("counts only flexi leave inside the requested period", () => {
  const result = countBookedLeaveDays({ leave, type: "flexi", startKey: "2026-08-01", endKey: "2026-08-16" });
  assert.equal(result, 1);
});

test("excludes bank holidays from every summary", () => {
  const result = countBookedLeaveDays({
    leave,
    type: "annual",
    startKey: "2026-08-01",
    endKey: "2026-08-31",
    bankHolidayDates: new Set(["2026-08-03", "2026-08-24"]),
  });
  assert.equal(result, 5);
});

test("returns zero for invalid ranges", () => {
  assert.equal(countBookedLeaveDays({ leave, type: "annual", startKey: "2026-09-01", endKey: "2026-08-01" }), 0);
});

test("the page exposes allowance editing in settings and four time-off totals", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /settings-allowance/);
  assert.match(page, /Time off at a glance/);
  assert.match(page, /Annual remaining/);
  assert.match(page, /Annual booked/);
  assert.match(page, /Flexi this period/);
  assert.match(page, /Flexi this year/);
});

test("time-off sidebar panels share the same full width", () => {
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.leave-sidebar>\.panel\s*\{[^}]*width:100%[^}]*margin-left:0[^}]*margin-right:0/);
});
