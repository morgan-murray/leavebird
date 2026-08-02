import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFlexiBalance,
  calendarQuarterLabel,
  flexiPeriodBounds,
  isRangeWithinFlexiPeriod,
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

test("deducts configured daily hours for flexi leave without using annual leave rules", () => {
  const result = calculateFlexiBalance({
    contractedHoursPerWeek: 40,
    contractedHoursPerDay: 7.5,
    periodStart: new Date(2026, 7, 3),
    periodEnd: new Date(2026, 7, 3),
    entries: {},
    leave: [{ start: "2026-08-03", end: "2026-08-03", type: "flexi" }],
    bankHolidayDates: [],
  });
  assert.equal(result.flexiLeaveHours, 7.5);
  assert.equal(result.balance, -7.5);
});

test("keeps regular and legacy annual leave neutral", () => {
  for (const leave of [
    { start: "2026-08-03", end: "2026-08-03", type: "annual" },
    { start: "2026-08-03", end: "2026-08-03" },
  ]) {
    const result = calculateFlexiBalance({
      contractedHoursPerWeek: 37.5,
      contractedHoursPerDay: 7.5,
      periodStart: new Date(2026, 7, 3),
      periodEnd: new Date(2026, 7, 3),
      entries: {},
      leave: [leave],
      bankHolidayDates: [],
    });
    assert.equal(result.balance, 0);
    assert.equal(result.flexiLeaveHours, 0);
  }
});

test("does not deduct flexi leave on weekends or bank holidays", () => {
  const result = calculateFlexiBalance({
    contractedHoursPerWeek: 37.5,
    contractedHoursPerDay: 7.5,
    periodStart: new Date(2026, 7, 8),
    periodEnd: new Date(2026, 7, 10),
    entries: {},
    leave: [{ start: "2026-08-08", end: "2026-08-10", type: "flexi" }],
    bankHolidayDates: ["2026-08-10"],
  });
  assert.equal(result.flexiLeaveHours, 0);
  assert.equal(result.balance, 0);
});

test("limits flexi leave to the current selected period", () => {
  const today = new Date(2026, 7, 18);
  const monthly = flexiPeriodBounds("monthly", today);
  assert.equal(monthly.start.getDate(), 1);
  assert.equal(monthly.end.getDate(), 31);
  assert.equal(isRangeWithinFlexiPeriod("2026-08-01", "2026-08-31", "monthly", today), true);
  assert.equal(isRangeWithinFlexiPeriod("2026-07-31", "2026-08-01", "monthly", today), false);

  const quarterly = flexiPeriodBounds("quarterly", today);
  assert.equal(quarterly.start.getMonth(), 6);
  assert.equal(quarterly.end.getMonth(), 8);
  assert.equal(isRangeWithinFlexiPeriod("2026-07-01", "2026-09-30", "quarterly", today), true);
  assert.equal(isRangeWithinFlexiPeriod("2026-09-30", "2026-10-01", "quarterly", today), false);
});
