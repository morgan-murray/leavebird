/**
 * @typedef {{ hours: number, breakHours: number }} FlexiEntry
 * @typedef {{ start: string, end: string }} FlexiLeave
 * @typedef {{
 *   entries: Record<string, FlexiEntry>,
 *   leave: FlexiLeave[],
 *   bankHolidayDates: Iterable<string>,
 *   contractedHoursPerWeek: number | null,
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
export function calendarQuarterLabel(date) {
  return `Q${Math.floor(date.getMonth() / 3) + 1}`;
}

/** @param {FlexiBalanceInput} input */
export function calculateFlexiBalance({
  entries,
  leave,
  bankHolidayDates,
  contractedHoursPerWeek,
  periodStart,
  periodEnd,
}) {
  const start = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
  const end = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());
  const bankHolidays = new Set(bankHolidayDates);
  const dailyContract = contractedHoursPerWeek && contractedHoursPerWeek > 0
    ? contractedHoursPerWeek / 5
    : 0;

  let actualHours = 0;
  let assumedHours = 0;
  let expectedDays = 0;

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = flexiDateKey(cursor);
    const entry = entries[key];
    const recordedHours = entry
      ? Math.max(0, (Number(entry.hours) || 0) - (Number(entry.breakHours) || 0))
      : 0;
    const hasRecordedTime = Boolean(entry && ((Number(entry.hours) || 0) > 0 || (Number(entry.breakHours) || 0) > 0));
    actualHours += recordedHours;

    const weekday = ![0, 6].includes(cursor.getDay());
    const bookedLeave = leave.some(item => item.start <= key && item.end >= key);
    const contractedDay = weekday && !bookedLeave && !bankHolidays.has(key);
    if (contractedDay) {
      expectedDays += 1;
      if (!hasRecordedTime) assumedHours += dailyContract;
    }
  }

  const expectedHours = expectedDays * dailyContract;
  return {
    actualHours,
    assumedHours,
    expectedHours,
    balance: actualHours + assumedHours - expectedHours,
    expectedDays,
  };
}
