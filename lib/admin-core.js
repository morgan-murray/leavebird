const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Deny by default and compare only immutable user IDs. */
export function isConfiguredAdmin(userId, configuredAdminId) {
  if (!userId || !configuredAdminId || !uuidPattern.test(configuredAdminId.trim())) return false;
  return userId.toLowerCase() === configuredAdminId.trim().toLowerCase();
}

export function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function summariseLatency(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return { count: 0, average: null, p50: null, p95: null, p99: null };
  return {
    count: clean.length,
    average: clean.reduce((total, value) => total + value, 0) / clean.length,
    p50: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
    p99: percentile(clean, 0.99),
  };
}

const mondayKey = dateKey => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
};

const meaningfulEntry = entry => {
  if (!entry || typeof entry !== "object") return false;
  return Number(entry.hours) > 0 || Boolean(entry.start) || Boolean(entry.end);
};

const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const median = values => percentile(values, 0.5) ?? 0;

/**
 * Aggregate saved JSON without retaining or returning notes, leave labels or other user content.
 * @param {{user_id: string, data: unknown}[]} rows
 * @param {Date} now
 */
export function summariseTimesheets(rows, now = new Date()) {
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
  const sevenKey = sevenDaysAgo.toISOString().slice(0, 10);
  const thirtyKey = thirtyDaysAgo.toISOString().slice(0, 10);
  let dailyEntries = 0;
  let submittedWeeks = 0;
  let entriesLast7Days = 0;
  let entriesLast30Days = 0;
  let submittedLast7Days = 0;
  let submittedLast30Days = 0;
  const weeksPerUser = [];
  const activeWeekDays = [];

  for (const row of rows) {
    const data = row.data && typeof row.data === "object" ? row.data : {};
    const entries = data.entries && typeof data.entries === "object" ? data.entries : {};
    const weeks = new Map();
    for (const [dateKey, entry] of Object.entries(entries)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !meaningfulEntry(entry)) continue;
      dailyEntries += 1;
      if (dateKey >= sevenKey) entriesLast7Days += 1;
      if (dateKey >= thirtyKey) entriesLast30Days += 1;
      const week = mondayKey(dateKey);
      weeks.set(week, (weeks.get(week) || 0) + 1);
    }
    if (weeks.size) {
      weeksPerUser.push(weeks.size);
      activeWeekDays.push(...weeks.values());
    }
    const submissions = data.submissions && typeof data.submissions === "object" ? data.submissions : {};
    for (const [weekKey, submission] of Object.entries(submissions)) {
      if (!submission || typeof submission !== "object") continue;
      submittedWeeks += 1;
      const submittedAt = typeof submission.submittedAt === "string" ? submission.submittedAt.slice(0, 10) : weekKey;
      if (submittedAt >= sevenKey) submittedLast7Days += 1;
      if (submittedAt >= thirtyKey) submittedLast30Days += 1;
    }
  }

  const recordedWeeks = weeksPerUser.reduce((sum, value) => sum + value, 0);
  return {
    dailyEntries,
    recordedWeeks,
    submittedWeeks,
    usersWithRecordedWeeks: weeksPerUser.length,
    averageWeeksPerRecordingUser: average(weeksPerUser),
    medianWeeksPerRecordingUser: median(weeksPerUser),
    averageWorkdaysPerActiveWeek: average(activeWeekDays),
    entriesLast7Days,
    entriesLast30Days,
    submittedLast7Days,
    submittedLast30Days,
  };
}

const trendDateKey = value => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

export function buildDailyTrend(rows, days, now = new Date()) {
  const result = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    result.push({ date: key, value: rows.filter(row => trendDateKey(row.date) === key).reduce((sum, row) => sum + Number(row.value || 0), 0) });
  }
  return result;
}
