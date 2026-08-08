export const DEFAULT_LEAVE_YEAR_START = "04-06";

const boundaryPattern = /^(\d{2})-(\d{2})$/;

export function isValidLeaveYearStart(value) {
  if (typeof value !== "string") return false;
  const match = value.match(boundaryPattern);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInLeaveYearMonth(month);
}

export function normaliseLeaveYearStart(value) {
  return isValidLeaveYearStart(value) ? value : null;
}

export function daysInLeaveYearMonth(month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 31;
  return new Date(2000, month, 0).getDate();
}

export function leaveYearBoundaryParts(value) {
  const boundary = isValidLeaveYearStart(value) ? value : DEFAULT_LEAVE_YEAR_START;
  const [month, day] = boundary.split("-").map(Number);
  return { boundary, month, day };
}

function boundaryDate(year, value) {
  const { month, day } = leaveYearBoundaryParts(value);
  const finalDay = Math.min(day, new Date(year, month, 0).getDate());
  return new Date(year, month - 1, finalDay);
}

/** @param {Date} today @param {string | null | undefined} value */
export function leaveYearBounds(today = new Date(), value = null) {
  const thisYear = boundaryDate(today.getFullYear(), value);
  const startYear = today < thisYear ? today.getFullYear() - 1 : today.getFullYear();
  const start = boundaryDate(startYear, value);
  const nextStart = boundaryDate(startYear + 1, value);
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
  return { start, end, boundary: leaveYearBoundaryParts(value).boundary };
}

export function formatLeaveYearStart(value, locale = "en-GB") {
  const { month, day } = leaveYearBoundaryParts(value);
  return new Date(2000, month - 1, day).toLocaleDateString(locale, { day: "numeric", month: "long" });
}
