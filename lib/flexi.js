/**
 * @typedef {{ hours: number, breakHours: number }} FlexiEntry
 * @typedef {{ start: string, end: string, type?: "annual" | "flexi" }} FlexiLeave
 * @typedef {{
 *   entries: Record<string, FlexiEntry>,
 *   leave: FlexiLeave[],
 *   bankHolidayDates: Iterable<string>,
 *   contractedHoursPerWeek: number | null,
 *   contractedHoursPerDay?: number | null,
 *   periodStart: Date,
 *   periodEnd: Date
 * }} FlexiBalanceInput
 */

const pad = (value) => String(value).padStart(2, "0");

/** @param {Date} date */
export const flexiDateKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** @param {Date} date @param {number} amount */
const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

/** @param {Date} date */
export function startOfCalendarMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** @param {Date} date */
export function startOfCalendarQuarter(date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

/** @param {Date} date */
export function endOfCalendarMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** @param {Date} date */
export function endOfCalendarQuarter(date) {
  const start = startOfCalendarQuarter(date);
  return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}

/** @param {"monthly" | "quarterly"} period @param {Date} date */
export function flexiPeriodBounds(period, date = new Date()) {
  return period === "quarterly"
    ? { start: startOfCalendarQuarter(date), end: endOfCalendarQuarter(date) }
    : { start: startOfCalendarMonth(date), end: endOfCalendarMonth(date) };
}

/** @param {string} startKey @param {string} endKey @param {"monthly" | "quarterly"} period @param {Date} date */
export function isRangeWithinFlexiPeriod(startKey, endKey, period, date = new Date()) {
  const bounds = flexiPeriodBounds(period, date);
  return startKey >= flexiDateKey(bounds.start)
    && endKey <= flexiDateKey(bounds.end)
    && endKey >= startKey;
}

/** @param {Date} date */
export function calendarQuarterLabel(date) {
  return `Q${Math.floor(date.getMonth() / 3) + 1}`;
}

/** @param {FlexiBalanceInput} input */
export function calculateFlexiBalance({
  entries,
  leave,
  bankHolidayDates,
  contractedHoursPerWeek,
  contractedHoursPerDay,
  periodStart,
  periodEnd,
}) {
  const start = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
  const end = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());
  const bankHolidays = new Set(bankHolidayDates);
  const dailyContract = contractedHoursPerWeek && contractedHoursPerWeek > 0
    ? contractedHoursPerWeek / 5
    : 0;
  const flexiLeaveDailyContract = contractedHoursPerDay && contractedHoursPerDay > 0
    ? contractedHoursPerDay
    : dailyContract;

  let actualHours = 0;
  let assumedHours = 0;
  let expectedDays = 0;
  let flexiLeaveHours = 0;
  let flexiLeaveExpectedHours = 0;

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = flexiDateKey(cursor);
    const entry = entries[key];
    const recordedHours = entry
      ? Math.max(0, (Number(entry.hours) || 0) - (Number(entry.breakHours) || 0))
      : 0;
    const hasRecordedTime = Boolean(entry && ((Number(entry.hours) || 0) > 0 || (Number(entry.breakHours) || 0) > 0));
    actualHours += recordedHours;

    const weekday = ![0, 6].includes(cursor.getDay());
    const bookedLeave = leave.find(item => item.start <= key && item.end >= key);
    const flexiLeave = bookedLeave?.type === "flexi";
    const annualLeave = Boolean(bookedLeave && !flexiLeave);
    const contractedDay = weekday && !annualLeave && !bankHolidays.has(key);
    if (contractedDay) {
      expectedDays += 1;
      if (flexiLeave) {
        flexiLeaveHours += flexiLeaveDailyContract;
        flexiLeaveExpectedHours += dailyContract;
      } else if (!hasRecordedTime) {
        assumedHours += dailyContract;
      }
    }
  }

  const expectedHours = expectedDays * dailyContract;
  return {
    actualHours,
    assumedHours,
    expectedHours,
    flexiLeaveHours,
    balance: actualHours + assumedHours - expectedHours + flexiLeaveExpectedHours - flexiLeaveHours,
    expectedDays,
  };
}
