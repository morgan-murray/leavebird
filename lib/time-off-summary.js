const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date) {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Counts unique booked working days for one leave type inside an inclusive range.
 * Weekends and bank holidays are excluded.
 */
export function countBookedLeaveDays({ leave, type, startKey, endKey, bankHolidayDates = new Set() }) {
  if (!dateKeyPattern.test(startKey) || !dateKeyPattern.test(endKey) || startKey > endKey) return 0;
  const booked = new Set();

  for (const item of leave || []) {
    const itemType = item.type === "flexi" ? "flexi" : "annual";
    if (itemType !== type || !dateKeyPattern.test(item.start) || !dateKeyPattern.test(item.end)) continue;
    const first = item.start < startKey ? startKey : item.start;
    const last = item.end > endKey ? endKey : item.end;
    if (first > last) continue;

    let cursor = fromDateKey(first);
    const end = fromDateKey(last);
    while (cursor <= end) {
      const key = toDateKey(cursor);
      if (![0, 6].includes(cursor.getDay()) && !bankHolidayDates.has(key)) booked.add(key);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return booked.size;
}
