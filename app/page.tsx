"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type Mode = "clock" | "hours";
type HoursFormat = "decimal" | "hhmm";
type Entry = { start: string; end: string; hours: number; breakHours: number; note: string };
type Leave = { id: string; start: string; end: string; label: string };
type Submission = { submittedAt: string; format: HoursFormat; grossHours: number; breakHours: number; netHours: number };
type Store = { entries: Record<string, Entry>; leave: Leave[]; allowance: number; mode: Mode; hoursFormat: HoursFormat; submissions: Record<string, Submission> };
type User = { id: string; email: string };

const STORAGE_KEY = "clocked-off-timesheet-v1";
const emptyEntry = (): Entry => ({ start: "", end: "", hours: 0, breakHours: 0, note: "" });
const initialStore: Store = { entries: {}, leave: [], allowance: 25, mode: "clock", hoursFormat: "decimal", submissions: {} };

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (date: Date, days: number) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
const mondayOf = (date: Date) => { const d = new Date(date); const offset = (d.getDay() + 6) % 7; return addDays(d, -offset); };
const hoursBetween = (start: string, end: string) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
};
const netHours = (entry: Entry, _mode: Mode) => Math.max(0, (Number(entry.hours) || 0) - (Number(entry.breakHours) || 0));
const fmt = (value: number) => `${Number(value.toFixed(2))}h`;
const formattedHours = (value: number, format: HoursFormat) => {
  if (format === "decimal") return Number(value.toFixed(2)).toString();
  const minutes = Math.round(value * 60); return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
};
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
const fullDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function financialYearStart(today = new Date()) {
  const start = new Date(today.getFullYear(), 3, 6);
  return today < start ? new Date(today.getFullYear() - 1, 3, 6) : start;
}

function datesInRange(start: string, end: string) {
  const dates: string[] = []; let cursor = fromKey(start); const last = fromKey(end);
  while (cursor <= last) { dates.push(keyOf(cursor)); cursor = addDays(cursor, 1); }
  return dates;
}

export default function Home() {
  const [store, setStore] = useState<Store>(initialStore);
  const [loaded, setLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [tab, setTab] = useState<"week" | "history" | "leave">("week");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [leaveDraft, setLeaveDraft] = useState({ start: keyOf(new Date()), end: keyOf(new Date()), label: "Annual leave" });
  const [savedFlash, setSavedFlash] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(response => response.json()).then(({ user: account }) => setUser(account)).finally(() => setAuthReady(true));
  }, []);
  useEffect(() => {
    if (!user) { setLoaded(false); return; }
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/data");
      if (!response.ok) return;
      const result = await response.json() as { data: Store | null; hasData: boolean };
      let next = result.data ? { ...initialStore, ...result.data } : initialStore;
      if (!result.hasData) {
        try { const legacy = localStorage.getItem(STORAGE_KEY); if (legacy) next = { ...initialStore, ...JSON.parse(legacy) }; } catch { /* leave the new account blank */ }
      }
      if (!cancelled) { setStore(next); setLoaded(true); }
      if (!result.hasData) await fetch("/api/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    })().catch(() => setSaveStatus("error"));
    return () => { cancelled = true; };
  }, [user]);
  useEffect(() => {
    if (!loaded || !user) return;
    setSaveStatus("saving"); setSavedFlash(true);
    const id = setTimeout(async () => {
      try {
        const response = await fetch("/api/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(store) });
        setSaveStatus(response.ok ? "saved" : "error");
      } catch { setSaveStatus("error"); }
      setSavedFlash(false);
    }, 500);
    return () => clearTimeout(id);
  }, [store, loaded, user]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const currentWeekKey = keyOf(weekStart);
  const weekGross = days.reduce((sum, day) => sum + (Number(store.entries[keyOf(day)]?.hours) || 0), 0);
  const weekBreaks = days.reduce((sum, day) => sum + (Number(store.entries[keyOf(day)]?.breakHours) || 0), 0);
  const weekTotal = Math.max(0, weekGross - weekBreaks);
  const currentSubmission = store.submissions?.[currentWeekKey];
  const weekChecks = useMemo(() => {
    const errors: string[] = []; const missing: string[] = [];
    days.forEach(day => {
      if ([0, 6].includes(day.getDay())) return;
      const entry = store.entries[keyOf(day)] || emptyEntry();
      const dayName = day.toLocaleDateString("en-GB", { weekday: "long" });
      const gross = Number(entry.hours) || 0; const breaks = Number(entry.breakHours) || 0;
      if (store.mode === "clock" && Boolean(entry.start) !== Boolean(entry.end)) errors.push(`${dayName} needs both a start and finish time.`);
      if (store.mode === "clock" && entry.start && entry.end && entry.end <= entry.start) errors.push(`${dayName}'s finish time must be after its start time.`);
      if (breaks > gross) errors.push(`${dayName}'s break is longer than its recorded hours.`);
      if (gross === 0) missing.push(dayName);
    });
    return { errors, missing };
  }, [days, store.entries, store.mode]);
  const weekReady = weekGross > 0 && weekChecks.errors.length === 0;
  const fyStart = financialYearStart(); const fyEnd = addDays(new Date(fyStart.getFullYear() + 1, 3, 6), -1);
  const fyTotal = Object.entries(store.entries).reduce((sum, [key, entry]) => {
    const date = fromKey(key); return date >= fyStart && date <= fyEnd ? sum + netHours(entry, store.mode) : sum;
  }, 0);
  const bookedWeekdays = new Set(store.leave.flatMap(item => datesInRange(item.start, item.end)).filter(key => ![0, 6].includes(fromKey(key).getDay())));
  const leaveRemaining = Math.max(0, store.allowance - bookedWeekdays.size);

  const reopenCurrentWeek = (current: Store) => { const submissions = { ...(current.submissions || {}) }; delete submissions[currentWeekKey]; return submissions; };
  const updateEntry = (dateKey: string, patch: Partial<Entry>) => setStore(current => ({ ...current, submissions: reopenCurrentWeek(current), entries: { ...current.entries, [dateKey]: { ...(current.entries[dateKey] || emptyEntry()), ...patch } } }));
  const updateClockEntry = (dateKey: string, patch: Pick<Partial<Entry>, "start" | "end">) => setStore(current => {
    const next = { ...(current.entries[dateKey] || emptyEntry()), ...patch };
    next.hours = hoursBetween(next.start, next.end);
    return { ...current, submissions: reopenCurrentWeek(current), entries: { ...current.entries, [dateKey]: next } };
  });
  const changeWeek = (amount: number) => setWeekStart(current => addDays(current, amount * 7));
  const addLeave = () => {
    if (!leaveDraft.start || !leaveDraft.end || leaveDraft.end < leaveDraft.start) return;
    setStore(current => ({ ...current, leave: [...current.leave, { id: crypto.randomUUID(), ...leaveDraft }] }));
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `leavebird-backup-${keyOf(new Date())}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const importData = async (file?: File) => {
    if (!file) return; try { const parsed = JSON.parse(await file.text()); setStore({ ...initialStore, ...parsed }); } catch { alert("That backup file could not be read."); }
  };
  const weekRows = () => days.map(day => {
    const entry = store.entries[keyOf(day)] || emptyEntry(); const gross = Number(entry.hours) || 0; const breaks = Number(entry.breakHours) || 0;
    return { date: keyOf(day), day: day.toLocaleDateString("en-GB", { weekday: "long" }), entry, gross, breaks, payable: Math.max(0, gross - breaks) };
  });
  const copyWeek = async () => {
    const heading = ["Date", "Day", "Start", "Finish", `Gross (${store.hoursFormat === "decimal" ? "decimal" : "HH:MM"})`, "Break", "Payable", "Note"];
    const rows = weekRows().map(row => [row.date, row.day, row.entry.start, row.entry.end, formattedHours(row.gross, store.hoursFormat), formattedHours(row.breaks, store.hoursFormat), formattedHours(row.payable, store.hoursFormat), row.entry.note]);
    try { await navigator.clipboard.writeText([heading, ...rows].map(row => row.join("\t")).join("\n")); setCopyStatus("copied"); setTimeout(() => setCopyStatus("idle"), 2200); }
    catch { setCopyStatus("error"); }
  };
  const downloadCsv = () => {
    const heading = ["Date", "Day", "Start", "Finish", "Gross", "Break", "Payable", "Note"];
    const rows = weekRows().map(row => [row.date, row.day, row.entry.start, row.entry.end, formattedHours(row.gross, store.hoursFormat), formattedHours(row.breaks, store.hoursFormat), formattedHours(row.payable, store.hoursFormat), row.entry.note]);
    const blob = new Blob([[heading, ...rows].map(row => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `leavebird-week-${currentWeekKey}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const downloadPdf = async () => {
    const { jsPDF } = await import("jspdf"); const pdf = new jsPDF();
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(19); pdf.text("Leavebird weekly timesheet", 16, 18);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text(`${fullDate(weekStart)} to ${fullDate(addDays(weekStart, 6))}`, 16, 27);
    pdf.setFont("helvetica", "bold"); pdf.text(`Gross ${formattedHours(weekGross, store.hoursFormat)}   Breaks ${formattedHours(weekBreaks, store.hoursFormat)}   Payable ${formattedHours(weekTotal, store.hoursFormat)}`, 16, 37);
    pdf.setFontSize(9); pdf.text("Day", 16, 49); pdf.text("Start", 52, 49); pdf.text("Finish", 73, 49); pdf.text("Gross", 96, 49); pdf.text("Break", 119, 49); pdf.text("Payable", 142, 49); pdf.text("Note", 167, 49);
    pdf.setFont("helvetica", "normal");
    weekRows().forEach((row, index) => { const y = 57 + index * 9; pdf.text(row.day.slice(0, 3), 16, y); pdf.text(row.entry.start || "-", 52, y); pdf.text(row.entry.end || "-", 73, y); pdf.text(formattedHours(row.gross, store.hoursFormat), 96, y); pdf.text(formattedHours(row.breaks, store.hoursFormat), 119, y); pdf.text(formattedHours(row.payable, store.hoursFormat), 142, y); pdf.text(row.entry.note.slice(0, 25) || "-", 167, y, { maxWidth: 28 }); });
    pdf.save(`leavebird-week-${currentWeekKey}.pdf`);
  };
  const markSubmitted = () => {
    if (!weekReady) return;
    setStore(current => ({ ...current, submissions: { ...(current.submissions || {}), [currentWeekKey]: { submittedAt: new Date().toISOString(), format: current.hoursFormat, grossHours: weekGross, breakHours: weekBreaks, netHours: weekTotal } } }));
  };
  const reopenWeek = () => setStore(current => ({ ...current, submissions: reopenCurrentWeek(current) }));

  const historicalWeeks = useMemo(() => {
    const grouped = new Map<string, number>();
    Object.entries(store.entries).forEach(([key, entry]) => { const monday = keyOf(mondayOf(fromKey(key))); grouped.set(monday, (grouped.get(monday) || 0) + netHours(entry, store.mode)); });
    return [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [store.entries, store.mode]);

  const monthGrid = useMemo(() => {
    const first = mondayOf(calendarMonth); return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [calendarMonth]);

  if (!authReady) return <div className="auth-loading"><span className="brand-mark">↗</span><p>Opening your timesheet…</p></div>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;

  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); setStore(initialStore); };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("week")} aria-label="Go to this week">
          <span className="brand-mark">↗</span><span><b>Leavebird</b><small>work smart · wander often</small></span>
        </button>
        <nav aria-label="Main navigation">
          <button className={tab === "week" ? "active" : ""} onClick={() => setTab("week")}>This week</button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History</button>
          <button className={tab === "leave" ? "active" : ""} onClick={() => setTab("leave")}>Time off</button>
        </nav>
        <div className={`save-state ${savedFlash ? "saving" : ""} ${saveStatus === "error" ? "failed" : ""}`}><span>●</span> {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Saved securely"}</div>
        <div className="account-menu"><span>{user.email}</span><button onClick={signOut}>Sign out</button></div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">YOUR TIME, YOURS</p><h1>{tab === "leave" ? "Plan the escape." : tab === "history" ? "The bigger picture." : "Get the week done."}</h1><p className="lede">{tab === "leave" ? "Keep your allowance honest and your next adventure visible." : "A calmer way to log the hours — and keep the weekend in sight."}</p></div>
        <div className="hero-stats">
          <div><span>This week</span><strong>{fmt(weekTotal)}</strong></div>
          <div><span>Financial year</span><strong>{fmt(fyTotal)}</strong></div>
          <div className="sun-stat"><span>Leave left</span><strong>{leaveRemaining}d</strong></div>
        </div>
      </section>

      {tab !== "leave" && (
        <section className="mode-bar">
          <div><span className="tiny-label">RECORD BY</span><div className="segmented" role="group" aria-label="Time entry mode"><button className={store.mode === "clock" ? "selected" : ""} onClick={() => setStore(s => ({ ...s, mode: "clock" }))}>Start & finish</button><button className={store.mode === "hours" ? "selected" : ""} onClick={() => setStore(s => ({ ...s, mode: "hours" }))}>Number of hours</button></div></div>
          <p>Breaks are subtracted from each day. Decimal hours welcome — try 0.5 for 30 minutes.</p>
        </section>
      )}

      {tab === "week" && <>
        <section className={`panel sheet-panel ${store.mode}`}>
          <div className="panel-heading"><div><p className="eyebrow coral">WEEKLY TIMESHEET</p><h2>{shortDate(weekStart)} — {fullDate(addDays(weekStart, 6))}</h2></div><div className="week-nav"><button onClick={() => changeWeek(-1)} aria-label="Previous week">←</button><button onClick={() => setWeekStart(mondayOf(new Date()))}>Today</button><button onClick={() => changeWeek(1)} aria-label="Next week">→</button></div></div>
          <div className="sheet-head"><span>Day</span><span>{store.mode === "clock" ? "Start" : "Hours"}</span>{store.mode === "clock" && <span>Finish</span>}<span>Break</span><span>Note</span><span>Total</span></div>
          <div className="sheet-rows">
            {days.map(day => { const key = keyOf(day); const entry = store.entries[key] || emptyEntry(); const weekend = [0, 6].includes(day.getDay()); return <div className={`day-row ${weekend ? "weekend" : ""}`} key={key}>
              <div className="day-name"><b>{day.toLocaleDateString("en-GB", { weekday: "short" })}</b><span>{day.getDate()}</span></div>
              {store.mode === "clock" ? <><label><span className="mobile-only">Start</span><input type="time" value={entry.start} onChange={e => updateClockEntry(key, { start: e.target.value })} /></label><label><span className="mobile-only">Finish</span><input type="time" value={entry.end} onChange={e => updateClockEntry(key, { end: e.target.value })} /></label></> : <label><span className="mobile-only">Hours</span><input type="number" min="0" step="0.25" value={entry.hours || ""} placeholder="0" onChange={e => updateEntry(key, { hours: Number(e.target.value) })} /></label>}
              <label><span className="mobile-only">Break</span><input type="number" min="0" step="0.25" value={entry.breakHours || ""} placeholder="0" onChange={e => updateEntry(key, { breakHours: Number(e.target.value) })} /></label>
              <label className="note-field"><span className="mobile-only">Note</span><input value={entry.note} placeholder={weekend ? "Weekend plans?" : "What did you work on?"} onChange={e => updateEntry(key, { note: e.target.value })} /></label>
              <strong className="row-total">{fmt(netHours(entry, store.mode))}</strong>
            </div>; })}
          </div>
          <div className="sheet-total"><span>Week total</span><strong>{fmt(weekTotal)}</strong></div>
        </section>
        <section className={`panel completion-panel ${currentSubmission ? "submitted" : weekReady ? "ready" : "review"}`}>
          <div className="completion-copy">
            <p className="eyebrow coral">{currentSubmission ? "SUBMITTED" : "READY TO HAND OVER"}</p>
            <h2>{currentSubmission ? "This week is marked as submitted." : weekReady ? "Your week is ready to submit." : "A quick check before you submit."}</h2>
            <p>{currentSubmission ? `Submitted ${new Date(currentSubmission.submittedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. Reopen it if you need to make a correction.` : "Review the totals, choose your employer's preferred format, then copy or download the week."}</p>
            {!currentSubmission && weekChecks.errors.length > 0 && <ul className="check-list errors">{weekChecks.errors.map(error => <li key={error}>! {error}</li>)}</ul>}
            {!currentSubmission && weekChecks.missing.length > 0 && <p className="missing-note">Review: no hours recorded for {weekChecks.missing.join(", ")}.</p>}
          </div>
          <div className="completion-tools">
            <div className="total-strip"><div><span>Gross hours</span><strong>{fmt(weekGross)}</strong></div><div><span>Breaks</span><strong>{fmt(weekBreaks)}</strong></div><div><span>Payable</span><strong>{fmt(weekTotal)}</strong></div></div>
            <div className="format-choice"><span>Employer format</span><div className="segmented" role="group" aria-label="Employer hours format"><button className={store.hoursFormat === "decimal" ? "selected" : ""} onClick={() => setStore(current => ({ ...current, hoursFormat: "decimal" }))}>Decimal</button><button className={store.hoursFormat === "hhmm" ? "selected" : ""} onClick={() => setStore(current => ({ ...current, hoursFormat: "hhmm" }))}>HH:MM</button></div></div>
            <div className="completion-actions"><button className="secondary" onClick={copyWeek} disabled={weekGross === 0}>{copyStatus === "copied" ? "✓ Copied" : copyStatus === "error" ? "Copy failed" : "Copy hours"}</button><button className="secondary" onClick={downloadCsv} disabled={weekGross === 0}>Download CSV</button><button className="secondary" onClick={downloadPdf} disabled={weekGross === 0}>Download PDF</button>{currentSubmission ? <button className="primary reopen" onClick={reopenWeek}>Reopen week</button> : <button className="primary" onClick={markSubmitted} disabled={!weekReady}>Mark as submitted ✓</button>}</div>
          </div>
        </section>
        <Deals kind="weekend" />
      </>}

      {tab === "history" && <>
        <section className="history-grid">
          <div className="panel history-panel"><div className="panel-heading"><div><p className="eyebrow coral">YOUR HISTORY</p><h2>Weeks on record</h2></div><span className="fy-pill">FY {fyStart.getFullYear()}/{String(fyEnd.getFullYear()).slice(-2)}</span></div>
            {historicalWeeks.length ? <div className="history-list">{historicalWeeks.map(([monday, total]) => { const submission = store.submissions?.[monday]; return <button key={monday} onClick={() => { setWeekStart(fromKey(monday)); setTab("week"); }}><span><b>{fullDate(fromKey(monday))}</b><small>Week ending {shortDate(addDays(fromKey(monday), 6))}</small><em className={submission ? "submitted" : "draft"}>{submission ? "✓ Submitted" : "Draft"}</em></span><strong>{fmt(total)}</strong><i>→</i></button>; })}</div> : <div className="empty-state"><span>✦</span><h3>Your history starts here</h3><p>Add some hours to this week and they’ll appear here automatically.</p><button onClick={() => setTab("week")}>Log this week</button></div>}
          </div>
          <aside className="panel data-panel"><p className="eyebrow">SYNCED & PRIVATE</p><h3>Your records follow you.</h3><p>Sign in on another browser or device and your timesheets and leave will be waiting. You can still download a personal backup whenever you like.</p><button onClick={exportData}>↓ Export backup</button><button className="secondary" onClick={() => importRef.current?.click()}>↑ Import backup</button><input ref={importRef} type="file" accept="application/json" hidden onChange={e => importData(e.target.files?.[0])} /></aside>
        </section>
        <Deals kind="weekend" />
      </>}

      {tab === "leave" && <>
        <section className="leave-layout">
          <div className="panel calendar-panel">
            <div className="panel-heading"><div><p className="eyebrow teal">LEAVE CALENDAR</p><h2>{calendarMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2></div><div className="week-nav"><button onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>←</button><button onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>→</button></div></div>
            <div className="calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <span key={d}>{d}</span>)}</div>
            <div className="calendar-grid">{monthGrid.map(day => { const key = keyOf(day); const booking = store.leave.find(item => item.start <= key && item.end >= key); const today = key === keyOf(new Date()); return <div key={key} className={`${day.getMonth() !== calendarMonth.getMonth() ? "muted" : ""} ${booking ? "booked" : ""} ${today ? "today" : ""}`}><span>{day.getDate()}</span>{booking && <small>{booking.label}</small>}</div>; })}</div>
          </div>
          <aside className="leave-sidebar">
            <section className="panel allowance-card"><div className="allowance-top"><span>☀</span><div><p>Annual allowance</p><label><input type="number" min="0" step="0.5" value={store.allowance} onChange={e => setStore(s => ({ ...s, allowance: Number(e.target.value) }))} /><small> days</small></label></div></div><div className="allowance-track"><i style={{ width: `${Math.min(100, (bookedWeekdays.size / Math.max(1, store.allowance)) * 100)}%` }} /></div><div className="allowance-numbers"><span><b>{bookedWeekdays.size}</b> booked</span><span><b>{leaveRemaining}</b> remaining</span></div></section>
            <section className="panel book-card"><p className="eyebrow coral">BOOK TIME OFF</p><label>From<input type="date" value={leaveDraft.start} onChange={e => setLeaveDraft(d => ({ ...d, start: e.target.value, end: e.target.value > d.end ? e.target.value : d.end }))} /></label><label>To<input type="date" min={leaveDraft.start} value={leaveDraft.end} onChange={e => setLeaveDraft(d => ({ ...d, end: e.target.value }))} /></label><label>What’s the plan?<input value={leaveDraft.label} onChange={e => setLeaveDraft(d => ({ ...d, label: e.target.value }))} /></label><button onClick={addLeave}>Add to calendar ↗</button></section>
            {store.leave.length > 0 && <section className="panel booked-list"><p className="eyebrow">UPCOMING</p>{store.leave.slice().sort((a, b) => a.start.localeCompare(b.start)).map(item => <div key={item.id}><span><b>{item.label}</b><small>{shortDate(fromKey(item.start))}{item.end !== item.start ? ` — ${shortDate(fromKey(item.end))}` : ""}</small></span><button onClick={() => setStore(s => ({ ...s, leave: s.leave.filter(l => l.id !== item.id) }))} aria-label={`Remove ${item.label}`}>×</button></div>)}</section>}
          </aside>
        </section>
        <Deals kind="holiday" />
      </>}

      <footer><span><b>Leavebird</b> · your time stays yours</span><span>Securely synced to your account</span></footer>
    </main>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await response.json() as { user?: User; error?: string };
      if (!response.ok || !result.user) setError(result.error || "Something went wrong. Please try again."); else onAuthenticated(result.user);
    } catch { setError("Could not reach the server. Please try again."); }
    finally { setBusy(false); }
  };

  return <main className="auth-shell">
    <section className="auth-story"><div className="auth-brand"><span className="brand-mark">↗</span><b>Leavebird</b></div><div><p className="eyebrow">YOUR TIME, ANYWHERE</p><h1>Get the week done.<br /><em>Plan the escape.</em></h1><p>Your timesheets, history and leave plans — waiting on every device.</p></div><div className="auth-stamps"><span>☀ LEAVE</span><span>✓ HOURS</span><span>↗ WEEKEND</span></div></section>
    <section className="auth-panel"><form onSubmit={submit}><p className="eyebrow coral">{mode === "login" ? "WELCOME BACK" : "MAKE IT YOURS"}</p><h2>{mode === "login" ? "Sign in to your time." : "Create your account."}</h2><p className="auth-copy">{mode === "login" ? "Your records are securely synced across your browsers and devices." : "Your existing browser timesheet will be brought into your new account automatically."}</p>
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 10 : undefined} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in ↗" : "Create account ↗"}</button>
      <p className="auth-switch">{mode === "login" ? "New to Leavebird?" : "Already have an account?"} <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account!" : "Sign in"}</button></p>
    </form></section>
  </main>;
}

function Deals({ kind }: { kind: "weekend" | "holiday" }) {
  const deals = kind === "weekend" ? [
    { tag: "WEEKEND IDEA", icon: "🎟", title: "Comedy, cocktails & no calendar invites", copy: "Hunt down a last-minute night out near you.", source: "Wowcher", url: "https://www.wowcher.co.uk/deals/things-to-do-activities" },
    { tag: "LOCAL ESCAPE", icon: "🧗", title: "Try something you’ll mention on Monday", copy: "Activities, food and small adventures for two.", source: "Groupon", url: "https://www.groupon.co.uk/vouchers/things-to-do" },
  ] : [
    { tag: "PACK LIGHT", icon: "🌊", title: "Turn three leave days into a proper escape", copy: "Browse spontaneous city and beach breaks.", source: "lastminute.com", url: "https://www.lastminute.com/holidays/" },
    { tag: "DEAL SPOTTED", icon: "✈", title: "The long weekend is calling", copy: "Fresh travel deals and delightfully cheap flights.", source: "HolidayPirates", url: "https://www.holidaypirates.com/" },
  ];
  return <section className={`deals ${kind}`}><div className="deals-title"><div><p className="eyebrow">{kind === "weekend" ? "LEAVEBIRD PICKS" : "ESCAPE BOARD"}</p><h2>{kind === "weekend" ? "Make the weekend count." : "Give those leave days somewhere to go."}</h2></div><span>Handy links · not sponsored</span></div><div className="deal-cards">{deals.map(deal => <a key={deal.source} href={deal.url} target="_blank" rel="noreferrer"><div className="deal-icon">{deal.icon}</div><div><small>{deal.tag}</small><h3>{deal.title}</h3><p>{deal.copy}</p><b>Browse on {deal.source} <i>↗</i></b></div></a>)}</div></section>;
}
