import { query } from "./db";

export type RouteGroup = "page" | "authentication" | "timesheet-data" | "bank-holidays" | "admin";
export type ActivityKind = "authenticated-visit" | "data-update";
export type OperationalEvent = "login" | "registration" | "admin-access" | "bank-holiday-fetch";

let lastCleanup = 0;
const RETENTION_DAYS = 90;

async function cleanupIfDue() {
  const now = Date.now();
  if (now - lastCleanup < 24 * 60 * 60 * 1000) return;
  lastCleanup = now;
  await Promise.all([
    query("DELETE FROM request_metrics WHERE recorded_at < NOW() - INTERVAL '90 days'"),
    query("DELETE FROM operational_events WHERE recorded_at < NOW() - INTERVAL '90 days'"),
    query("DELETE FROM user_activity_daily WHERE activity_date < CURRENT_DATE - 90"),
  ]);
}

export function recordRequestMetric(routeGroup: RouteGroup, statusCode: number, durationMs: number) {
  void query(
    "INSERT INTO request_metrics (route_group, status_code, duration_ms) VALUES ($1, $2, $3)",
    [routeGroup, statusCode, Math.max(0, durationMs)],
  ).then(cleanupIfDue).catch(() => undefined);
}

export function recordUserActivity(userId: string, activityKind: ActivityKind) {
  void query(
    `INSERT INTO user_activity_daily (user_id, activity_date, activity_kind, event_count)
     VALUES ($1, CURRENT_DATE, $2, 1)
     ON CONFLICT (user_id, activity_date, activity_kind)
     DO UPDATE SET event_count = user_activity_daily.event_count + 1`,
    [userId, activityKind],
  ).then(cleanupIfDue).catch(() => undefined);
}

export function recordOperationalEvent(eventType: OperationalEvent, succeeded: boolean) {
  void query(
    "INSERT INTO operational_events (event_type, succeeded) VALUES ($1, $2)",
    [eventType, succeeded],
  ).then(cleanupIfDue).catch(() => undefined);
}

export async function measuredRoute(routeGroup: RouteGroup, handler: () => Promise<Response>) {
  const started = performance.now();
  try {
    const response = await handler();
    recordRequestMetric(routeGroup, response.status, performance.now() - started);
    return response;
  } catch (error) {
    recordRequestMetric(routeGroup, 500, performance.now() - started);
    throw error;
  }
}

export const metricsRetentionDays = RETENTION_DAYS;
