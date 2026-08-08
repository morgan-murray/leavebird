import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_LEAVE_YEAR_START,
  daysInLeaveYearMonth,
  formatLeaveYearStart,
  isValidLeaveYearStart,
  leaveYearBounds,
  normaliseLeaveYearStart,
} from "../lib/leave-year.js";

test("preserves 6 April as the default for existing users", () => {
  assert.equal(DEFAULT_LEAVE_YEAR_START, "04-06");
  const before = leaveYearBounds(new Date(2026, 3, 5));
  assert.deepEqual([before.start.getFullYear(), before.start.getMonth(), before.start.getDate()], [2025, 3, 6]);
  assert.deepEqual([before.end.getFullYear(), before.end.getMonth(), before.end.getDate()], [2026, 3, 5]);
  const onBoundary = leaveYearBounds(new Date(2026, 3, 6));
  assert.deepEqual([onBoundary.start.getFullYear(), onBoundary.start.getMonth(), onBoundary.start.getDate()], [2026, 3, 6]);
});

test("uses a configured January leave year consistently", () => {
  const result = leaveYearBounds(new Date(2026, 7, 8), "01-01");
  assert.deepEqual([result.start.getFullYear(), result.start.getMonth(), result.start.getDate()], [2026, 0, 1]);
  assert.deepEqual([result.end.getFullYear(), result.end.getMonth(), result.end.getDate()], [2026, 11, 31]);
});

test("moves an October boundary to the previous year when necessary", () => {
  const result = leaveYearBounds(new Date(2026, 7, 8), "10-01");
  assert.deepEqual([result.start.getFullYear(), result.start.getMonth(), result.start.getDate()], [2025, 9, 1]);
  assert.deepEqual([result.end.getFullYear(), result.end.getMonth(), result.end.getDate()], [2026, 8, 30]);
});

test("supports leap-day starts and clamps non-leap anniversaries", () => {
  assert.equal(isValidLeaveYearStart("02-29"), true);
  const result = leaveYearBounds(new Date(2025, 2, 1), "02-29");
  assert.deepEqual([result.start.getFullYear(), result.start.getMonth(), result.start.getDate()], [2025, 1, 28]);
  assert.deepEqual([result.end.getFullYear(), result.end.getMonth(), result.end.getDate()], [2026, 1, 27]);
});

test("rejects invalid stored boundaries and falls back safely", () => {
  for (const value of [undefined, null, "", "13-01", "02-30", "April 6"]) {
    assert.equal(normaliseLeaveYearStart(value), null);
  }
  assert.equal(formatLeaveYearStart(null), "6 April");
});

test("offers the correct number of days for each selected month", () => {
  assert.equal(daysInLeaveYearMonth(2), 29);
  assert.equal(daysInLeaveYearMonth(4), 30);
  assert.equal(daysInLeaveYearMonth(12), 31);
});

test("the settings and current-year displays use the saved boundary", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /leaveYearStart: string \| null/);
  assert.match(page, /normaliseLeaveYearStart\(merged\.leaveYearStart\)/);
  assert.match(page, /leaveYearBounds\(today, store\.leaveYearStart\)/);
  assert.match(page, /date >= fyStart && date <= fyEnd/);
  assert.match(page, /id="leave-year-month"/);
  assert.match(page, /id="leave-year-day"/);
  assert.match(page, />Leave year</);
});
