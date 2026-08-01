"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "clock" | "hours";
type Entry = { start: string; end: string; hours: number; breakHours: number; note: string };
type Leave = { id: string; start: string; end: string; label: string };
type Store = { entries: Record<string, Entry>; leave: Leave[]; allowance: number; mode: Mode };

const STORAGE_KEY = "clocked-off-timesheet-v1";
const emptyEntry = (): Entry => ({ start: "", end: "", hours: 0, breakHours: 0, note: "" });
const initialStore: Store = { entries: {}, leave: [], allowance: 25, mode: "clock" };

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
  const [tab, setTab] = useState<"week" | "history" | "leave">("week");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [leaveDraft, setLeaveDraft] = useState({ start: keyOf(new Date()), end: keyOf(new Date()), label: "Annual leave" });
  const [savedFlash, setSavedFlash] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setStore({ ...initialStore, ...JSON.parse(saved) }); } catch { /* keep a safe blank sheet */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); setSavedFlash(true); const id = setTimeout(() => setSavedFlash(false), 900); return () => clearTimeout(id); } }, [store, loaded]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekTotal = days.reduce((sum, day) => sum + netHours(store.entries[keyOf(day)] || emptyEntry(), store.mode), 0);
  const fyStart = financialYearStart(); const fyEnd = addDays(new Date(fyStart.getFullYear() + 1, 3, 6), -1);
  const fyTotal = Object.entries(store.entries).reduce((sum, [key, entry]) => {
    const date = fromKey(key); return date >= fyStart && date <= fyEnd ? sum + netHours(entry, store.mode) : sum;
  }, 0);
  const bookedWeekdays = new Set(store.leave.flatMap(item => datesInRange(item.start, item.end)).filter(key => ![0, 6].includes(fromKey(key).getDay())));
  const leaveRemaining = Math.max(0, store.allowance - bookedWeekdays.size);

  const updateEntry = (dateKey: string, patch: Partial<Entry>) => setStore(current => ({ ...current, entries: { ...current.entries, [dateKey]: { ...(current.entries[dateKey] || emptyEntry()), ...patch } } }));
  const updateClockEntry = (dateKey: string, patch: Pick<Partial<Entry>, "start" | "end">) => setStore(current => {
    const next = { ...(current.entries[dateKey] || emptyEntry()), ...patch };
    next.hours = hoursBetween(next.start, next.end);
    return { ...current, entries: { ...current.entries, [dateKey]: next } };
  });
  const changeWeek = (amount: number) => setWeekStart(current => addDays(current, amount * 7));
  const addLeave = () => {
    if (!leaveDraft.start || !leaveDraft.end || leaveDraft.end < leaveDraft.start) return;
    setStore(current => ({ ...current, leave: [...current.leave, { id: crypto.randomUUID(), ...leaveDraft }] }));
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `clocked-off-backup-${keyOf(new Date())}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const importData = async (file?: File) => {
    if (!file) return; try { const parsed = JSON.parse(await file.text()); setStore({ ...initialStore, ...parsed }); } catch { alert("That backup file could not be read."); }
  };

  const historicalWeeks = useMemo(() => {
    const grouped = new Map<string, number>();
    Object.entries(store.entries).forEach(([key, entry]) => { const monday = keyOf(mondayOf(fromKey(key))); grouped.set(monday, (grouped.get(monday) || 0) + netHours(entry, store.mode)); });
    return [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [store.entries, store.mode]);

  const monthGrid = useMemo(() => {
    const first = mondayOf(calendarMonth); return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [calendarMonth]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("week")} aria-label="Go to this week">
          <span className="brand-mark">↗</span><span><b>Clocked Off</b><small>work smart · wander often</small></span>
        </button>
        <nav aria-label="Main navigation">
          <button className={tab === "week" ? "active" : ""} onClick={() => setTab("week")}>This week</button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History</button>
          <button className={tab === "leave" ? "active" : ""} onClick={() => setTab("leave")}>Time off</button>
        </nav>
        <div className={`save-state ${savedFlash ? "saving" : ""}`}><span>●</span> Saved locally</div>
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
        <Deals kind="weekend" />
      </>}

      {tab === "history" && <>
        <section className="history-grid">
          <div className="panel history-panel"><div className="panel-heading"><div><p className="eyebrow coral">YOUR HISTORY</p><h2>Weeks on record</h2></div><span className="fy-pill">FY {fyStart.getFullYear()}/{String(fyEnd.getFullYear()).slice(-2)}</span></div>
            {historicalWeeks.length ? <div className="history-list">{historicalWeeks.map(([monday, total]) => <button key={monday} onClick={() => { setWeekStart(fromKey(monday)); setTab("week"); }}><span><b>{fullDate(fromKey(monday))}</b><small>Week ending {shortDate(addDays(fromKey(monday), 6))}</small></span><strong>{fmt(total)}</strong><i>→</i></button>)}</div> : <div className="empty-state"><span>✦</span><h3>Your history starts here</h3><p>Add some hours to this week and they’ll appear here automatically.</p><button onClick={() => setTab("week")}>Log this week</button></div>}
          </div>
          <aside className="panel data-panel"><p className="eyebrow">LOCAL & PRIVATE</p><h3>Your records live in this browser.</h3><p>No login, no cloud account. Download a backup whenever you like, then import it on another device.</p><button onClick={exportData}>↓ Export backup</button><button className="secondary" onClick={() => importRef.current?.click()}>↑ Import backup</button><input ref={importRef} type="file" accept="application/json" hidden onChange={e => importData(e.target.files?.[0])} /></aside>
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

      <footer><span><b>Clocked Off</b> · your time stays yours</span><span>Stored only in this browser · No account required</span></footer>
    </main>
  );
}

function Deals({ kind }: { kind: "weekend" | "holiday" }) {
  const deals = kind === "weekend" ? [
    { tag: "WEEKEND IDEA", icon: "🎟", title: "Comedy, cocktails & no calendar invites", copy: "Hunt down a last-minute night out near you.", source: "Wowcher", url: "https://www.wowcher.co.uk/deals/things-to-do-activities" },
    { tag: "LOCAL ESCAPE", icon: "🧗", title: "Try something you’ll mention on Monday", copy: "Activities, food and small adventures for two.", source: "Groupon", url: "https://www.groupon.co.uk/local/things-to-do" },
  ] : [
    { tag: "PACK LIGHT", icon: "🌊", title: "Turn three leave days into a proper escape", copy: "Browse spontaneous city and beach breaks.", source: "lastminute.com", url: "https://www.lastminute.com/holidays/" },
    { tag: "DEAL SPOTTED", icon: "✈", title: "The long weekend is calling", copy: "Fresh travel deals and delightfully cheap flights.", source: "HolidayPirates", url: "https://www.holidaypirates.com/" },
  ];
  return <section className={`deals ${kind}`}><div className="deals-title"><div><p className="eyebrow">{kind === "weekend" ? "CLOCKED-OFF PICKS" : "ESCAPE BOARD"}</p><h2>{kind === "weekend" ? "Make the weekend count." : "Give those leave days somewhere to go."}</h2></div><span>Handy links · not sponsored</span></div><div className="deal-cards">{deals.map(deal => <a key={deal.source} href={deal.url} target="_blank" rel="noreferrer"><div className="deal-icon">{deal.icon}</div><div><small>{deal.tag}</small><h3>{deal.title}</h3><p>{deal.copy}</p><b>Browse on {deal.source} <i>↗</i></b></div></a>)}</div></section>;
}
