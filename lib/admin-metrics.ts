import { getDatabaseRuntimeStats, query } from "./db";
import { buildDailyTrend, summariseLatency, summariseTimesheets } from "./admin-core.js";
import { metricsRetentionDays } from "./metrics";

type UserRow = { id: string; created_at: Date };
type TimesheetRow = { user_id: string; data: unknown };
type ActivityRow = { activity_date: Date; user_id: string };
type RequestRow = { recorded_at: Date; route_group: string; status_code: number; duration_ms: number };
type EventRow = { recorded_at: Date; event_type: string; succeeded: boolean };
type StorageRow = {
  database_bytes: string;
  timesheet_table_bytes: string;
  timesheet_index_bytes: string;
  payload_bytes: string;
  average_payload_bytes: string;
};
type CountRow = { users: string; sessions: string; timesheets: string; request_metrics: string };
type MigrationRow = { filename: string; applied_at: Date };

export type LatencySummary = {
  count: number;
  average: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  requestRatePerHour: number;
  fourXxRate: number;
  fiveXxRate: number;
};

export type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;

const DAY = 24 * 60 * 60 * 1000;
const startTime = new Date();

function asNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number | null, digits = 1) {
  if (value === null) return null;
  return Number(value.toFixed(digits));
}

function latencyWindow(rows: RequestRow[], since: Date, hours: number): LatencySummary {
  const windowRows = rows.filter(row => new Date(row.recorded_at) >= since);
  const latency = summariseLatency(windowRows.map(row => Number(row.duration_ms)));
  const total = windowRows.length;
  return {
    count: total,
    average: round(latency.average),
    p50: round(latency.p50),
    p95: round(latency.p95),
    p99: round(latency.p99),
    requestRatePerHour: round(total / Math.max(hours, 1), 2) ?? 0,
    fourXxRate: total ? round(windowRows.filter(row => row.status_code >= 400 && row.status_code < 500).length * 100 / total, 2) ?? 0 : 0,
    fiveXxRate: total ? round(windowRows.filter(row => row.status_code >= 500).length * 100 / total, 2) ?? 0 : 0,
  };
}

function eventCount(rows: EventRow[], type: string, succeeded: boolean, since: Date) {
  return rows.filter(row => row.event_type === type && row.succeeded === succeeded && new Date(row.recorded_at) >= since).length;
}

async function publicHealth() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return { status: "unknown" as const, latencyMs: null, checkedAt: new Date().toISOString() };
  const started = performance.now();
  try {
    const response = await fetch(new URL("/api/auth/oauth/status", appUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    return {
      status: response.ok ? "healthy" as const : "unhealthy" as const,
      latencyMs: round(performance.now() - started),
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return { status: "unhealthy" as const, latencyMs: null, checkedAt: new Date().toISOString() };
  }
}

function backupHealth(now: Date) {
  const raw = process.env.LAST_BACKUP_AT;
  const staleAfterHours = Math.max(1, Number(process.env.BACKUP_MAX_AGE_HOURS || 36));
  if (!raw) return { status: "unknown" as const, lastSuccessfulAt: null, ageHours: null, message: "Backup monitoring is not configured" };
  const last = new Date(raw);
  if (!Number.isFinite(last.getTime())) return { status: "unknown" as const, lastSuccessfulAt: null, ageHours: null, message: "Backup timestamp is invalid" };
  const ageHours = (now.getTime() - last.getTime()) / (60 * 60 * 1000);
  return {
    status: ageHours <= staleAfterHours ? "healthy" as const : "warning" as const,
    lastSuccessfulAt: last.toISOString(),
    ageHours: round(ageHours),
    message: ageHours <= staleAfterHours ? "Backup is within the expected window" : "Backup information is stale",
  };
}

export async function getAdminDashboardData(now = new Date()) {
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - DAY);

  const dbStarted = performance.now();
  await query("SELECT 1");
  const databaseProbeMs = performance.now() - dbStarted;

  const [
    usersResult,
    timesheetsResult,
    activityResult,
    requestsResult,
    eventsResult,
    storageResult,
    countsResult,
    migrationResult,
    endpoint,
  ] = await Promise.all([
    query<UserRow>("SELECT id, created_at FROM users ORDER BY created_at"),
    query<TimesheetRow>("SELECT user_id, data FROM user_timesheets"),
    query<ActivityRow>(`SELECT activity_date, user_id FROM user_activity_daily
      WHERE activity_date >= CURRENT_DATE - 89 ORDER BY activity_date`),
    query<RequestRow>(`SELECT recorded_at, route_group, status_code, duration_ms
      FROM request_metrics WHERE recorded_at >= NOW() - INTERVAL '7 days' ORDER BY recorded_at`),
    query<EventRow>(`SELECT recorded_at, event_type, succeeded FROM operational_events
      WHERE recorded_at >= NOW() - INTERVAL '90 days' ORDER BY recorded_at`),
    query<StorageRow>(`SELECT
      pg_database_size(current_database())::text AS database_bytes,
      pg_total_relation_size('user_timesheets')::text AS timesheet_table_bytes,
      pg_indexes_size('user_timesheets')::text AS timesheet_index_bytes,
      COALESCE(SUM(pg_column_size(data)), 0)::text AS payload_bytes,
      COALESCE(AVG(pg_column_size(data)), 0)::text AS average_payload_bytes
      FROM user_timesheets`),
    query<CountRow>(`SELECT
      (SELECT COUNT(*) FROM users)::text AS users,
      (SELECT COUNT(*) FROM sessions WHERE expires_at > NOW())::text AS sessions,
      (SELECT COUNT(*) FROM user_timesheets)::text AS timesheets,
      (SELECT COUNT(*) FROM request_metrics)::text AS request_metrics`),
    query<MigrationRow>("SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 1"),
    publicHealth(),
  ]);

  const users = usersResult.rows;
  const requests = requestsResult.rows;
  const events = eventsResult.rows;
  const timesheets = summariseTimesheets(timesheetsResult.rows, now);
  const totalUsers = users.length;
  const activityByDay = [...new Set(activityResult.rows.map(row => String(row.activity_date).slice(0, 10)))].map(date => ({
    date,
    value: new Set(activityResult.rows.filter(row => String(row.activity_date).slice(0, 10) === date).map(row => row.user_id)).size,
  }));
  const activeSince = (since: Date) => {
    const startKey = since.toISOString().slice(0, 10);
    return new Set(activityResult.rows
      .filter(row => String(row.activity_date).slice(0, 10) >= startKey)
      .map(row => row.user_id)).size;
  };

  const routeGroups = [...new Set(requests.map(row => row.route_group))];
  const routeBreakdown = routeGroups.map(routeGroup => {
    const rows = requests.filter(row => row.route_group === routeGroup && new Date(row.recorded_at) >= oneDayAgo);
    const latency = summariseLatency(rows.map(row => Number(row.duration_ms)));
    return {
      routeGroup,
      requests: rows.length,
      averageMs: round(latency.average),
      p95Ms: round(latency.p95),
      errors: rows.filter(row => row.status_code >= 400).length,
    };
  }).sort((a, b) => (b.p95Ms ?? 0) - (a.p95Ms ?? 0));

  const hourlyPerformance = Array.from({ length: 24 }, (_, index) => {
    const start = new Date(now.getTime() - (23 - index) * 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const rows = requests.filter(row => new Date(row.recorded_at) >= start && new Date(row.recorded_at) < end);
    return { date: start.toISOString(), value: round(summariseLatency(rows.map(row => Number(row.duration_ms))).p95) ?? 0 };
  });

  const latestBankHolidaySuccess = [...events].reverse().find(row => row.event_type === "bank-holiday-fetch" && row.succeeded);
  const latestBankHolidayFailure = [...events].reverse().find(row => row.event_type === "bank-holiday-fetch" && !row.succeeded);
  const storage = storageResult.rows[0];
  const counts = countsResult.rows[0];
  const migration = migrationResult.rows[0];
  const dbRuntime = getDatabaseRuntimeStats();

  return {
    generatedAt: now.toISOString(),
    definitions: {
      entry: "A calendar day with recorded start/finish or working hours.",
      recordedWeek: "A Monday-to-Sunday week containing at least one recorded entry.",
      submittedWeek: "A week explicitly marked ready for employer submission.",
      activeUser: "A signed-in account that visited Leavebird or saved data during the period.",
    },
    users: {
      total: totalUsers,
      new24Hours: users.filter(user => new Date(user.created_at) >= oneDayAgo).length,
      new7Days: users.filter(user => new Date(user.created_at) >= sevenDaysAgo).length,
      new30Days: users.filter(user => new Date(user.created_at) >= thirtyDaysAgo).length,
      active1Day: activeSince(oneDayAgo),
      active7Days: activeSince(sevenDaysAgo),
      active30Days: activeSince(thirtyDaysAgo),
      registrationTrend30Days: buildDailyTrend(users.map(user => ({ date: user.created_at, value: 1 })), 30, now),
      registrationTrend90Days: buildDailyTrend(users.filter(user => new Date(user.created_at) >= ninetyDaysAgo).map(user => ({ date: user.created_at, value: 1 })), 90, now),
      activityTrend30Days: buildDailyTrend(activityByDay, 30, now),
      lastRegistrationAt: users.at(-1)?.created_at?.toISOString() ?? null,
    },
    engagement: {
      ...timesheets,
      adoptionPercent: totalUsers ? round(timesheets.usersWithRecordedWeeks * 100 / totalUsers, 1) ?? 0 : 0,
    },
    performance: {
      lastHour: latencyWindow(requests, oneHourAgo, 1),
      last24Hours: latencyWindow(requests, oneDayAgo, 24),
      last7Days: latencyWindow(requests, sevenDaysAgo, 168),
      routeBreakdown,
      hourlyP95: hourlyPerformance,
    },
    authentication: {
      loginSuccess24Hours: eventCount(events, "login", true, oneDayAgo),
      loginFailure24Hours: eventCount(events, "login", false, oneDayAgo),
      loginSuccess7Days: eventCount(events, "login", true, sevenDaysAgo),
      loginFailure7Days: eventCount(events, "login", false, sevenDaysAgo),
      registrationSuccess7Days: eventCount(events, "registration", true, sevenDaysAgo),
      registrationFailure7Days: eventCount(events, "registration", false, sevenDaysAgo),
      activeSessions: asNumber(counts?.sessions),
      adminAccessAccepted7Days: eventCount(events, "admin-access", true, sevenDaysAgo),
      adminAccessRejected7Days: eventCount(events, "admin-access", false, sevenDaysAgo),
    },
    storage: {
      databaseBytes: asNumber(storage?.database_bytes),
      timesheetTableBytes: asNumber(storage?.timesheet_table_bytes),
      timesheetIndexBytes: asNumber(storage?.timesheet_index_bytes),
      payloadBytes: asNumber(storage?.payload_bytes),
      averagePayloadBytes: asNumber(storage?.average_payload_bytes),
      userRows: asNumber(counts?.users),
      sessionRows: asNumber(counts?.sessions),
      timesheetRows: asNumber(counts?.timesheets),
      metricsRows: asNumber(counts?.request_metrics),
    },
    health: {
      application: { status: "healthy" as const, uptimeSeconds: Math.floor(process.uptime()), startedAt: startTime.toISOString() },
      database: { status: "healthy" as const, probeMs: round(databaseProbeMs), ...dbRuntime },
      publicEndpoint: endpoint,
      backup: backupHealth(now),
      lastMigration: migration ? { filename: migration.filename, appliedAt: migration.applied_at.toISOString() } : null,
      bankHolidays: {
        status: latestBankHolidayFailure && (!latestBankHolidaySuccess || new Date(latestBankHolidayFailure.recorded_at) > new Date(latestBankHolidaySuccess.recorded_at)) ? "warning" as const : latestBankHolidaySuccess ? "healthy" as const : "unknown" as const,
        lastSuccessAt: latestBankHolidaySuccess?.recorded_at?.toISOString() ?? null,
        lastFailureAt: latestBankHolidayFailure?.recorded_at?.toISOString() ?? null,
      },
    },
    privacy: {
      retentionDays: metricsRetentionDays,
      collected: "Route group, response status, duration, daily authenticated activity, and aggregate operational outcomes.",
      excluded: "Raw URLs, query values, passwords, session tokens, IP addresses, timesheet notes, leave descriptions, and comic-viewing history.",
    },
  };
}
