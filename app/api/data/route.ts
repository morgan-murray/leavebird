import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { measuredRoute, recordUserActivity } from "@/lib/metrics";

type DataRow = { data: unknown };

export async function GET() {
  return measuredRoute("timesheet-data", async () => {
    const user = await requireUser();
    if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
    const result = await query<DataRow>("SELECT data FROM user_timesheets WHERE user_id = $1", [user.id]);
    return Response.json({ data: result.rows[0]?.data ?? null, hasData: Boolean(result.rows[0]) });
  });
}

export async function PUT(request: Request) {
  return measuredRoute("timesheet-data", async () => {
    const user = await requireUser();
    if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });
    const raw = await request.text();
    if (raw.length > 2_000_000) return Response.json({ error: "Timesheet data is too large." }, { status: 413 });
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return Response.json({ error: "Invalid timesheet data." }, { status: 400 }); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return Response.json({ error: "Invalid timesheet data." }, { status: 400 });
    await query(`INSERT INTO user_timesheets (user_id, data, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`, [user.id, JSON.stringify(data)]);
    recordUserActivity(user.id, "data-update");
    return Response.json({ ok: true });
  });
}
