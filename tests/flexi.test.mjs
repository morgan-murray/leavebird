import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFlexiBalance,
  calendarQuarterLabel,
  startOfCalendarQuarter,
} from "../lib/flexi.js";

test("supports fractional contracted hours and positive balances", () => {
  const result = calculateFlexiBalance({
    contractedHoursPerWeek: 37.5,
    periodStart: new Date(2026, 7, 3),
    periodEnd: new Date(2026, 7, 7),
    entries: {
      "2026-08-03": { hours: 8, breakHours: 0.5 },
      "2026-08-04": { hours: 8, breakHours: 0.5 },
      "2026-08-05": { hours: 8, breakHours: 0.5 },
      "2026-08-06": { hours: 8, breakHours: 0.5 },
      "2026-08-07": { hours: 9, breakHours: 0.5 },
    },
    leave: [],
    bankHolidayDates: [],
  });
  assert.equal(result.expectedHours, 37.5);
  assert.equal(result.actualHours, 38.5);
  assert.equal(result.balance, 1);
});

test("excludes leave and bank holidays while assuming contract for blank working days", () => {
  const result = calculateFlexiBalance({
    contractedHoursPerWeek: 40,
    periodStart: new Date(2026, 7, 3),
    periodEnd: new Date(2026, 7, 7),
    entries: {
      "2026-08-03": { hours: 8, breakHours: 0 },
      "2026-08-06": { hours: 7, breakHours: 0 },
    },
    leave: [{ start: "2026-08-04", end: "2026-08-04" }],
    bankHolidayDates: ["2026-08-05"],
  });
  assert.equal(result.expectedDays, 3);
  assert.equal(result.expectedHours, 24);
  assert.equal(result.assumedHours, 8);
  assert.equal(result.balance, -1);
});

test("unentered timesheets are neutral and only recorded variance carries forward", () => {
  const result = calculateFlexiBalance({
    contractedHoursPerWeek: 37.5,
    periodStart: new Date(2026, 7, 3),
    periodEnd: new Date(2026, 7, 14),
    entries: {
      "2026-08-10": { hours: 10, breakHours: 0.5 },
    },
    leave: [],
    bankHolidayDates: [],
  });
  assert.equal(result.expectedDays, 10);
  assert.equal(result.expectedHours, 75);
  assert.equal(result.actualHours, 9.5);
  assert.equal(result.assumedHours, 67.5);
  assert.equal(result.balance, 2);
});

test("a completely unentered week has a zero flexi balance", () => {
  const result = calculateFlexiBalance({
    contractedHoursPerWeek: 37.5,
    periodStart: new Date(2026, 7, 3),
    periodEnd: new Date(2026, 7, 7),
    entries: {},
    leave: [],
    bankHolidayDates: [],
  });
  assert.equal(result.expectedHours, 37.5);
  assert.equal(result.assumedHours, 37.5);
  assert.equal(result.balance, 0);
});

test("returns zero when actual and expected hours match", () => {
  const result = calculateFlexiBalance({
    contractedHoursPerWeek: 10,
    periodStart: new Date(2026, 7, 3),
    periodEnd: new Date(2026, 7, 3),
    entries: { "2026-08-03": { hours: 2, breakHours: 0 } },
    leave: [],
    bankHolidayDates: [],
  });
  assert.equal(result.balance, 0);
});

test("uses calendar-quarter boundaries", () => {
  const start = startOfCalendarQuarter(new Date(2026, 7, 2));
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 6);
  assert.equal(start.getDate(), 1);
  assert.equal(calendarQuarterLabel(new Date(2026, 7, 2)), "Q3");
});
