import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin-auth";
import { getAdminDashboardData, type LatencySummary } from "@/lib/admin-metrics";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Leavebird health", robots: { index: false, follow: false } };

const whole = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const pounds = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${decimal.format(bytes / 1024 ** index)} ${units[index]}`;
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatMs(value: number | null) {
  return value === null ? "No data" : `${decimal.format(value)} ms`;
}

function toneFor(status: string) {
  return status === "healthy" ? styles.good : status === "warning" ? styles.warning : status === "unhealthy" ? styles.bad : styles.unknown;
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "good" | "warning" | "bad" }) {
  return <article className={`${styles.stat} ${tone ? styles[tone] : ""}`}>
    <span>{label}</span><strong>{value}</strong><small>{detail}</small>
  </article>;
}

function SparkBars({ points, label }: { points: { date: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...points.map(point => point.value));
  return <div className={styles.sparkWrap}>
    <div className={styles.spark} role="img" aria-label={label}>
      {points.map(point => <span key={point.date} title={`${point.date}: ${point.value}`} style={{ height: `${Math.max(4, point.value * 100 / max)}%` }} />)}
    </div>
    <div className={styles.sparkAxis}><span>{points[0]?.date.slice(5)}</span><span>{points.at(-1)?.date.slice(5)}</span></div>
  </div>;
}

function LatencyTable({ windows }: { windows: { label: string; value: LatencySummary }[] }) {
  return <div className={styles.tableWrap}><table>
    <thead><tr><th>Window</th><th>Requests</th><th>Average</th><th>p50</th><th>p95</th><th>p99</th><th>4xx</th><th>5xx</th></tr></thead>
    <tbody>{windows.map(({ label, value }) => <tr key={label}>
      <th>{label}</th><td>{whole.format(value.count)}</td><td>{formatMs(value.average)}</td><td>{formatMs(value.p50)}</td><td>{formatMs(value.p95)}</td><td>{formatMs(value.p99)}</td><td>{decimal.format(value.fourXxRate)}%</td><td>{decimal.format(value.fiveXxRate)}%</td>
    </tr>)}</tbody>
  </table></div>;
}

function HealthRow({ label, status, detail }: { label: string; status: string; detail: string }) {
  return <div className={styles.healthRow}>
    <div><strong>{label}</strong><span>{detail}</span></div>
    <span className={`${styles.status} ${toneFor(status)}`}>{status === "unknown" ? "Unknown" : status === "unhealthy" ? "Needs attention" : status === "warning" ? "Check" : "Healthy"}</span>
  </div>;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const requestedDays = Number(one(params.days));
  const data = await getAdminDashboardData(new Date(), {
    days: [7, 30, 90, 395].includes(requestedDays) ? requestedDays : 30,
    placement: one(params.placement) || "",
    merchant: one(params.merchant) || "",
  });
  const p95 = data.performance.last24Hours.p95;

  return <main className={styles.shell}>
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.bird} aria-hidden="true">●</span><span>leavebird</span><em>health</em></div>
      <div className={styles.headerActions}><span>Owner view · Morgan only</span><Link href="/">Back to timesheets</Link></div>
    </header>

    <section className={styles.intro}>
      <div><p className={styles.eyebrow}>Operational dashboard</p><h1>How is Leavebird doing?</h1><p>Growth, engagement, performance and the signals that need your attention—without exposing anyone’s timesheet content.</p></div>
      <div className={styles.freshness}><span>Last refreshed</span><strong>{formatDate(data.generatedAt)}</strong><small>Metrics retain {data.privacy.retentionDays} days</small></div>
    </section>

    <section className={styles.healthStrip} aria-label="Health at a glance">
      <Stat label="Registered users" value={whole.format(data.users.total)} detail={`+${data.users.new7Days} in 7 days`} />
      <Stat label="Active users" value={whole.format(data.users.active30Days)} detail={`${data.users.active7Days} in 7 days`} />
      <Stat label="Recorded weeks" value={whole.format(data.engagement.recordedWeeks)} detail={`${decimal.format(data.engagement.adoptionPercent)}% adoption`} />
      <Stat label="p95 latency" value={formatMs(p95)} detail="Last 24 hours" tone={p95 !== null && p95 > 1000 ? "warning" : "good"} />
      <Stat label="5xx rate" value={`${decimal.format(data.performance.last24Hours.fiveXxRate)}%`} detail="Last 24 hours" tone={data.performance.last24Hours.fiveXxRate > 1 ? "bad" : "good"} />
      <Stat label="Database" value={formatBytes(data.storage.databaseBytes)} detail={`${formatBytes(data.storage.payloadBytes)} timesheet JSON`} />
      <Stat label="Backups" value={data.health.backup.status === "healthy" ? "Current" : data.health.backup.status === "warning" ? "Stale" : "Unknown"} detail={data.health.backup.message} tone={data.health.backup.status === "healthy" ? "good" : "warning"} />
    </section>

    <div className={styles.grid}>
      <section className={`${styles.panel} ${styles.spanTwo}`}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Users and growth</p><h2>People are finding their way in</h2></div><span>30 days</span></div>
        <div className={styles.miniStats}>
          <div><strong>{data.users.new24Hours}</strong><span>New in 24h</span></div><div><strong>{data.users.new7Days}</strong><span>New in 7d</span></div><div><strong>{data.users.new30Days}</strong><span>New in 30d</span></div><div><strong>{formatDate(data.users.lastRegistrationAt)}</strong><span>Latest registration</span></div>
        </div>
        <div className={styles.chartPair}>
          <div><h3>Registrations</h3><SparkBars points={data.users.registrationTrend30Days} label="Daily registrations for the last 30 days" /></div>
          <div><h3>Active users</h3><SparkBars points={data.users.activityTrend30Days} label="Daily active users for the last 30 days" /></div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Activity</p><h2>Signed-in reach</h2></div></div>
        <div className={styles.stackStats}>
          <div><span>Daily active</span><strong>{data.users.active1Day}</strong></div>
          <div><span>Weekly active</span><strong>{data.users.active7Days}</strong></div>
          <div><span>Monthly active</span><strong>{data.users.active30Days}</strong></div>
          <div><span>Active sessions now</span><strong>{data.authentication.activeSessions}</strong></div>
        </div>
      </section>

      <section className={`${styles.panel} ${styles.spanThree}`}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Timesheet engagement</p><h2>From first entry to handover</h2></div><span>Aggregate only</span></div>
        <div className={styles.engagementGrid}>
          <Stat label="Daily entries" value={whole.format(data.engagement.dailyEntries)} detail={`${data.engagement.entriesLast7Days} in 7 days`} />
          <Stat label="Recorded weeks" value={whole.format(data.engagement.recordedWeeks)} detail={`${data.engagement.entriesLast30Days} entries in 30 days`} />
          <Stat label="Submitted weeks" value={whole.format(data.engagement.submittedWeeks)} detail={`${data.engagement.submittedLast30Days} in 30 days`} />
          <Stat label="Average weeks" value={decimal.format(data.engagement.averageWeeksPerRecordingUser)} detail="Per recording user" />
          <Stat label="Median weeks" value={decimal.format(data.engagement.medianWeeksPerRecordingUser)} detail="Per recording user" />
          <Stat label="Workdays / week" value={decimal.format(data.engagement.averageWorkdaysPerActiveWeek)} detail="Average active week" />
        </div>
        <details className={styles.definitions}><summary>Metric definitions</summary><dl>
          <div><dt>Entry</dt><dd>{data.definitions.entry}</dd></div><div><dt>Recorded week</dt><dd>{data.definitions.recordedWeek}</dd></div><div><dt>Submitted week</dt><dd>{data.definitions.submittedWeek}</dd></div><div><dt>Active user</dt><dd>{data.definitions.activeUser}</dd></div>
        </dl></details>
      </section>

      <section className={`${styles.panel} ${styles.spanThree}`}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Recommendations</p><h2>From useful idea to commission</h2></div><span>Anonymous aggregate reporting</span></div>
        <form className={styles.filterForm} method="get">
          <label>Period<select name="days" defaultValue={String(data.affiliate.filter.days)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="395">Last 13 months</option></select></label>
          <label>Placement<select name="placement" defaultValue={data.affiliate.filter.placement}><option value="">All placements</option>{data.affiliate.availablePlacements.map(value => <option key={value} value={value}>{value.replaceAll("-", " ")}</option>)}</select></label>
          <label>Merchant<select name="merchant" defaultValue={data.affiliate.filter.merchant}><option value="">All merchants</option>{data.affiliate.availableMerchants.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <button type="submit">Apply filters</button>
        </form>
        <div className={styles.affiliateStats}>
          <Stat label="Offer views" value={whole.format(data.affiliate.impressions)} detail="50% visible for 750ms" />
          <Stat label="Outbound clicks" value={whole.format(data.affiliate.clicks)} detail={`${decimal.format(data.affiliate.clickThroughRate)}% click-through rate`} />
          <Stat label="Conversions" value={whole.format(data.affiliate.conversions)} detail={`${decimal.format(data.affiliate.conversionRate)}% of clicks`} />
          <Stat label="Commission" value={pounds.format(data.affiliate.commissionMinor / 100)} detail={`${pounds.format(data.affiliate.earningsPerClickMinor / 100)} per click`} />
        </div>
        {data.affiliate.breakdown.length ? <div className={styles.tableWrap}><table>
          <thead><tr><th>Placement</th><th>Merchant</th><th>Views</th><th>Clicks</th><th>CTR</th><th>Conversions</th><th>Conv.</th><th>Commission</th></tr></thead>
          <tbody>{data.affiliate.breakdown.map(row => <tr key={`${row.placement}-${row.merchant}`}><th>{row.placement.replaceAll("-", " ")}</th><td>{row.merchant}</td><td>{whole.format(row.impressions)}</td><td>{whole.format(row.clicks)}</td><td>{decimal.format(row.clickThroughRate)}%</td><td>{whole.format(row.conversions)}</td><td>{decimal.format(row.conversionRate)}%</td><td>{pounds.format(row.commissionMinor / 100)}</td></tr>)}</tbody>
        </table></div> : <p className={styles.empty}>Recommendation activity will appear here as people view and open Leavebird picks.</p>}
        <details className={styles.definitions}><summary>Counting and privacy rules</summary><dl>
          <div><dt>Offer view</dt><dd>Counted once when at least half of a recommendation link is visible for 750 milliseconds.</dd></div>
          <div><dt>Outbound click</dt><dd>Counted once for each genuine signed-in redirect. Suspected bots are excluded where practical.</dd></div>
          <div><dt>Conversion</dt><dd>Deduplicated using a one-way hash of the network reference. Only merchant, placement, offer, currency and commission are retained.</dd></div>
          <div><dt>Failure behaviour</dt><dd>If reporting fails, the recommendation still opens normally.</dd></div>
        </dl></details>
      </section>

      <section className={`${styles.panel} ${styles.spanThree}`}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Performance and reliability</p><h2>Fast where it matters</h2></div><span>p50 · p95 · p99</span></div>
        <LatencyTable windows={[{ label: "Last hour", value: data.performance.lastHour }, { label: "Last 24 hours", value: data.performance.last24Hours }, { label: "Last 7 days", value: data.performance.last7Days }]} />
        <div className={styles.performanceGrid}>
          <div><h3>Hourly p95 · last 24 hours</h3><SparkBars points={data.performance.hourlyP95} label="Hourly p95 request latency for the last 24 hours" /></div>
          <div><h3>Route groups · last 24 hours</h3>{data.performance.routeBreakdown.length ? <div className={styles.routeList}>{data.performance.routeBreakdown.map(route => <div key={route.routeGroup}><span>{route.routeGroup}</span><strong>{formatMs(route.p95Ms)}</strong><small>{route.requests} requests · {route.errors} errors</small></div>)}</div> : <p className={styles.empty}>Metrics will appear as people use this release.</p>}</div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Service health</p><h2>All systems</h2></div></div>
        <div className={styles.healthList}>
          <HealthRow label="Application" status={data.health.application.status} detail={`${whole.format(data.health.application.uptimeSeconds / 60)} minutes uptime`} />
          <HealthRow label="PostgreSQL" status={data.health.database.status} detail={`${formatMs(data.health.database.probeMs)} probe`} />
          <HealthRow label="Public HTTPS" status={data.health.publicEndpoint.status} detail={formatMs(data.health.publicEndpoint.latencyMs)} />
          <HealthRow label="Bank holidays" status={data.health.bankHolidays.status} detail={data.health.bankHolidays.lastSuccessAt ? `Last success ${formatDate(data.health.bankHolidays.lastSuccessAt)}` : "Awaiting a successful fetch"} />
          <HealthRow label="Backups" status={data.health.backup.status} detail={data.health.backup.message} />
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Database</p><h2>Storage and capacity</h2></div></div>
        <div className={styles.stackStats}>
          <div><span>Timesheet table</span><strong>{formatBytes(data.storage.timesheetTableBytes)}</strong></div>
          <div><span>Table indexes</span><strong>{formatBytes(data.storage.timesheetIndexBytes)}</strong></div>
          <div><span>Average payload</span><strong>{formatBytes(data.storage.averagePayloadBytes)}</strong></div>
          <div><span>Connections</span><strong>{data.health.database.totalConnections} / 10</strong></div>
          <div><span>Average query</span><strong>{formatMs(data.health.database.averageQueryMs)}</strong></div>
          <div><span>Connection failures</span><strong>{data.health.database.connectionFailures}</strong></div>
        </div>
        <p className={styles.footnote}>Last migration: {data.health.lastMigration ? `${data.health.lastMigration.filename} · ${formatDate(data.health.lastMigration.appliedAt)}` : "Unknown"}</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>Authentication</p><h2>Sign-in health</h2></div><span>7 days</span></div>
        <div className={styles.stackStats}>
          <div><span>Successful logins</span><strong>{data.authentication.loginSuccess7Days}</strong></div>
          <div><span>Failed logins</span><strong>{data.authentication.loginFailure7Days}</strong></div>
          <div><span>Successful registrations</span><strong>{data.authentication.registrationSuccess7Days}</strong></div>
          <div><span>Registration failures</span><strong>{data.authentication.registrationFailure7Days}</strong></div>
          <div><span>Admin access allowed</span><strong>{data.authentication.adminAccessAccepted7Days}</strong></div>
          <div><span>Admin access rejected</span><strong>{data.authentication.adminAccessRejected7Days}</strong></div>
        </div>
      </section>

      <section className={`${styles.panel} ${styles.spanThree} ${styles.privacy}`}>
        <div><p className={styles.eyebrow}>Privacy and retention</p><h2>Useful signals, not surveillance</h2><p>{data.privacy.collected}</p></div>
        <div><strong>Never collected here</strong><p>{data.privacy.excluded}</p><small>Operational metrics are removed after {data.privacy.retentionDays} days; anonymous recommendation reporting after {data.privacy.affiliateRetentionDays} days. Collection failures never block login, saving or opening an offer.</small></div>
      </section>
    </div>
  </main>;
}
