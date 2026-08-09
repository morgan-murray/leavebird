"use client";

import Image from "next/image";
import { FcGoogle } from "react-icons/fc";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { TrackedOfferLink } from "@/components/TrackedOfferLink";
import { dailyChirpDismissalKey, dailyChirpForDate } from "@/lib/daily-chirp";
import { validateAnnualAllowance } from "@/lib/allowance";
import {
  calculateFlexiBalance,
  calendarQuarterLabel,
  flexiPeriodBounds,
  isRangeWithinFlexiPeriod,
} from "@/lib/flexi";
import {
  DEFAULT_LEAVE_YEAR_START,
  daysInLeaveYearMonth,
  formatLeaveYearStart,
  leaveYearBoundaryParts,
  leaveYearBounds,
  normaliseLeaveYearStart,
} from "@/lib/leave-year";
import { countBookedLeaveDays } from "@/lib/time-off-summary";
import { buildTimesheetCsv } from "@/lib/timesheet-export";

type Mode = "clock" | "hours";
type HoursFormat = "decimal" | "hhmm";
type FlexiPeriod = "monthly" | "quarterly";
type LeaveType = "annual" | "flexi";
type BankHolidayDivision = "england-and-wales" | "scotland" | "northern-ireland";
type BankHoliday = { title: string; date: string };
type BankHolidayData = Record<BankHolidayDivision, BankHoliday[]>;
type LeaveOpportunity = { id: string; title: string; start: string; end: string; totalDays: number; leaveDays: number };
type Entry = { start: string; end: string; hours: number; breakHours: number; note: string };
type Leave = { id: string; start: string; end: string; label: string; type: LeaveType };
type Submission = { submittedAt: string; format: HoursFormat; grossHours: number; breakHours: number; netHours: number };
type OAuthAvailability = { google: boolean };
type Store = { entries: Record<string, Entry>; leave: Leave[]; allowance: number; mode: Mode; hoursFormat: HoursFormat; employerUrl: string; bankHolidayDivision: BankHolidayDivision; submissions: Record<string, Submission>; contractedHoursPerWeek: number | null; contractedHoursPerDay: number | null; flexiPeriod: FlexiPeriod; leaveYearStart: string | null };
type User = { id: string; email: string; isAdmin: boolean };

const STORAGE_KEY = "clocked-off-timesheet-v1";
const emptyEntry = (): Entry => ({ start: "", end: "", hours: 0, breakHours: 0, note: "" });
const initialStore: Store = { entries: {}, leave: [], allowance: 25, mode: "clock", hoursFormat: "decimal", employerUrl: "", bankHolidayDivision: "england-and-wales", submissions: {}, contractedHoursPerWeek: null, contractedHoursPerDay: null, flexiPeriod: "monthly", leaveYearStart: null };
const emptyBankHolidays: BankHolidayData = { "england-and-wales": [], scotland: [], "northern-ireland": [] };
const divisionLabels: Record<BankHolidayDivision, string> = { "england-and-wales": "England & Wales", scotland: "Scotland", "northern-ireland": "Northern Ireland" };

function normaliseStore(value: Partial<Store>): Store {
  const merged = { ...initialStore, ...value };
  const legacyDailyHours = merged.contractedHoursPerWeek && merged.contractedHoursPerWeek > 0 ? merged.contractedHoursPerWeek / 5 : null;
  return {
    ...merged,
    contractedHoursPerDay: merged.contractedHoursPerDay && merged.contractedHoursPerDay > 0 ? merged.contractedHoursPerDay : legacyDailyHours,
    flexiPeriod: merged.flexiPeriod === "quarterly" ? "quarterly" : "monthly",
    leaveYearStart: normaliseLeaveYearStart(merged.leaveYearStart),
    leave: (merged.leave || []).map(item => ({ ...item, type: item.type === "flexi" ? "flexi" : "annual" })),
  };
}

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
const fmtMinutes = (hours: number) => `${Number((hours * 60).toFixed(1))}m`;
const formattedHours = (value: number, format: HoursFormat) => {
  if (format === "decimal") return Number(value.toFixed(2)).toString();
  const minutes = Math.round(value * 60); return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
};
const fullDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function normaliseEmployerUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function datesInRange(start: string, end: string) {
  const dates: string[] = []; let cursor = fromKey(start); const last = fromKey(end);
  while (cursor <= last) { dates.push(keyOf(cursor)); cursor = addDays(cursor, 1); }
  return dates;
}

function buildLeaveOpportunities(events: BankHoliday[], booked: Set<string>, today = new Date()): LeaveOpportunity[] {
  const holidays = new Set(events.map(event => event.date));
  const windows = new Map<string, LeaveOpportunity>();
  events.filter(event => event.date >= keyOf(today)).forEach(event => {
    const holiday = fromKey(event.date);
    const start = addDays(holiday, -((holiday.getDay() + 1) % 7));
    const end = addDays(holiday, (7 - holiday.getDay()) % 7);
    const startKey = keyOf(start); const endKey = keyOf(end);
    if (startKey < keyOf(today)) return;
    const range = datesInRange(startKey, endKey);
    const leaveDays = range.filter(key => { const day = fromKey(key).getDay(); return ![0, 6].includes(day) && !holidays.has(key) && !booked.has(key); }).length;
    if (leaveDays < 1 || leaveDays > 5) return;
    const id = `${startKey}:${endKey}`;
    const existing = windows.get(id);
    windows.set(id, { id, title: existing ? `${existing.title} + ${event.title}` : event.title, start: startKey, end: endKey, totalDays: range.length, leaveDays });
  });
  return [...windows.values()].sort((a, b) => a.start.localeCompare(b.start) || (b.totalDays / b.leaveDays) - (a.totalDays / a.leaveDays)).slice(0, 3);
}

function TimeField({ id, label, dayName, value, onChange }: { id: string; label: "Start" | "Finish"; dayName: string; value: string; onChange: (value: string) => void }) {
  return <div className="time-field">
    <label className="time-field-label" htmlFor={id}>{label}</label>
    <div className="time-control">
      <input id={id} type="time" value={value} aria-label={`${label} time for ${dayName}`} onChange={event => onChange(event.target.value)} />
      {value && <button type="button" className="time-clear" aria-label={`Clear ${label.toLowerCase()} time for ${dayName}`} title={`Clear ${label.toLowerCase()} time`} onClick={() => onChange("")}><span aria-hidden="true">×</span></button>}
    </div>
  </div>;
}

function FlexiStat({ label, balance, configured }: { label: string; balance: number; configured: boolean }) {
  if (!configured) return <div className="flexi-stat neutral" aria-label={`${label}: contracted hours not set`}>
    <span>{label}</span><strong>—</strong><small>Set weekly hours</small>
  </div>;
  const rounded = Number(balance.toFixed(2));
  const tone = rounded > 0 ? "positive" : rounded < 0 ? "negative" : "neutral";
  const value = rounded > 0 ? `+${rounded}h` : rounded < 0 ? `−${Math.abs(rounded)}h` : "0h";
  const status = rounded > 0 ? "↑ ahead" : rounded < 0 ? "↓ behind" : "On target";
  return <div className={`flexi-stat ${tone}`} aria-label={`${label}: ${value}, ${status}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{status}</small>
  </div>;
}

export default function Home() {
  const [store, setStore] = useState<Store>(initialStore);
  const [loaded, setLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [tab, setTab] = useState<"week" | "history" | "leave" | "settings">("week");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [leaveDraft, setLeaveDraft] = useState<{ start: string; end: string; label: string; type: LeaveType }>({ start: keyOf(new Date()), end: keyOf(new Date()), label: "Annual leave", type: "annual" });
  const [leaveDraftError, setLeaveDraftError] = useState("");
  const [allowanceEditing, setAllowanceEditing] = useState(false);
  const [allowanceDraft, setAllowanceDraft] = useState("");
  const [allowanceError, setAllowanceError] = useState("");
  const [allowanceUpdated, setAllowanceUpdated] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [employerUrlDraft, setEmployerUrlDraft] = useState("");
  const [employerUrlError, setEmployerUrlError] = useState("");
  const [bankHolidays, setBankHolidays] = useState<BankHolidayData>(emptyBankHolidays);
  const [bankHolidayStatus, setBankHolidayStatus] = useState<"loading" | "ready" | "error">("loading");
  const [chirpVisible, setChirpVisible] = useState(false);
  const [chirpDate] = useState(() => new Date());
  const importRef = useRef<HTMLInputElement>(null);
  const dailyChirp = useMemo(() => dailyChirpForDate(chirpDate), [chirpDate]);
  const chirpDismissalKey = useMemo(() => dailyChirpDismissalKey(chirpDate), [chirpDate]);

  useEffect(() => {
    fetch("/api/auth/me").then(response => response.json()).then(({ user: account }) => setUser(account)).finally(() => setAuthReady(true));
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/bank-holidays").then(response => {
      if (!response.ok) throw new Error("Bank holidays unavailable");
      return response.json() as Promise<{ divisions: BankHolidayData }>;
    }).then(result => { if (!cancelled) { setBankHolidays(result.divisions); setBankHolidayStatus("ready"); } }).catch(() => { if (!cancelled) setBankHolidayStatus("error"); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!user) { setLoaded(false); return; }
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/data");
      if (!response.ok) return;
      const result = await response.json() as { data: Store | null; hasData: boolean };
      let next = normaliseStore(result.data || {});
      if (!result.hasData) {
        try { const legacy = localStorage.getItem(STORAGE_KEY); if (legacy) next = normaliseStore(JSON.parse(legacy)); } catch { /* leave the new account blank */ }
      }
      if (!cancelled) { setStore(next); setEmployerUrlDraft(next.employerUrl || ""); setLoaded(true); }
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
  useEffect(() => {
    if (!loaded || saveStatus !== "saved") return;
    const todayEntry = store.entries[keyOf(chirpDate)];
    if (!todayEntry || (Number(todayEntry.hours) || 0) <= 0) return;
    const reveal = window.setTimeout(() => {
      try {
        setChirpVisible(localStorage.getItem(chirpDismissalKey) !== "1");
      } catch {
        setChirpVisible(true);
      }
    }, 0);
    return () => window.clearTimeout(reveal);
  }, [chirpDate, chirpDismissalKey, loaded, saveStatus, store.entries]);

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
  const today = new Date();
  const currentLeaveYear = leaveYearBounds(today, store.leaveYearStart);
  const fyStart = currentLeaveYear.start; const fyEnd = currentLeaveYear.end;
  const fyTotal = Object.entries(store.entries).reduce((sum, [key, entry]) => {
    const date = fromKey(key); return date >= fyStart && date <= fyEnd ? sum + netHours(entry, store.mode) : sum;
  }, 0);
  const selectedBankHolidays = bankHolidays[store.bankHolidayDivision] || [];
  const bankHolidayByDate = new Map(selectedBankHolidays.map(holiday => [holiday.date, holiday]));
  const bankHolidayKeys = new Set(bankHolidayByDate.keys());
  const currentFlexiPeriod = flexiPeriodBounds(store.flexiPeriod, today);
  const currentFlexiPeriodStartKey = keyOf(currentFlexiPeriod.start);
  const currentFlexiPeriodEndKey = keyOf(currentFlexiPeriod.end);
  const flexiConfigured = Boolean(store.contractedHoursPerWeek && store.contractedHoursPerWeek > 0);
  const selectedFlexi = calculateFlexiBalance({
    entries: store.entries,
    leave: store.leave,
    bankHolidayDates: bankHolidayKeys,
    contractedHoursPerWeek: store.contractedHoursPerWeek,
    contractedHoursPerDay: store.contractedHoursPerDay,
    periodStart: currentFlexiPeriod.start,
    periodEnd: currentFlexiPeriod.end,
  });
  const selectedFlexiLabel = store.flexiPeriod === "quarterly" ? `${calendarQuarterLabel(today)} flexi` : `${today.toLocaleDateString("en-GB", { month: "short" })} flexi`;
  const leaveYearParts = leaveYearBoundaryParts(store.leaveYearStart);
  const leaveYearDayOptions = Array.from({ length: daysInLeaveYearMonth(leaveYearParts.month) }, (_, index) => index + 1);
  const updateLeaveYearMonth = (month: number) => setStore(current => {
    const currentParts = leaveYearBoundaryParts(current.leaveYearStart);
    const day = Math.min(currentParts.day, daysInLeaveYearMonth(month));
    return { ...current, leaveYearStart: `${pad(month)}-${pad(day)}` };
  });
  const updateLeaveYearDay = (day: number) => setStore(current => {
    const currentParts = leaveYearBoundaryParts(current.leaveYearStart);
    return { ...current, leaveYearStart: `${pad(currentParts.month)}-${pad(day)}` };
  });
  const allBookedWeekdays = new Set(store.leave.flatMap(item => datesInRange(item.start, item.end)).filter(key => ![0, 6].includes(fromKey(key).getDay()) && !bankHolidayKeys.has(key)));
  const fyStartKey = keyOf(fyStart); const fyEndKey = keyOf(fyEnd);
  const annualLeaveTaken = countBookedLeaveDays({ leave: store.leave, type: "annual", startKey: fyStartKey, endKey: fyEndKey, bankHolidayDates: bankHolidayKeys });
  const flexiTakenThisPeriod = countBookedLeaveDays({ leave: store.leave, type: "flexi", startKey: currentFlexiPeriodStartKey, endKey: currentFlexiPeriodEndKey, bankHolidayDates: bankHolidayKeys });
  const calendarYearStartKey = `${today.getFullYear()}-01-01`; const calendarYearEndKey = `${today.getFullYear()}-12-31`;
  const flexiTakenThisYear = countBookedLeaveDays({ leave: store.leave, type: "flexi", startKey: calendarYearStartKey, endKey: calendarYearEndKey, bankHolidayDates: bankHolidayKeys });
  const leaveRemaining = Math.max(0, store.allowance - annualLeaveTaken);
  const leaveOpportunities = buildLeaveOpportunities(selectedBankHolidays, allBookedWeekdays);
  const savedEmployerUrl = normaliseEmployerUrl(store.employerUrl || "") || "";

  const reopenCurrentWeek = (current: Store) => { const submissions = { ...(current.submissions || {}) }; delete submissions[currentWeekKey]; return submissions; };
  const updateEntry = (dateKey: string, patch: Partial<Entry>) => setStore(current => ({ ...current, submissions: reopenCurrentWeek(current), entries: { ...current.entries, [dateKey]: { ...(current.entries[dateKey] || emptyEntry()), ...patch } } }));
  const updateClockEntry = (dateKey: string, patch: Pick<Partial<Entry>, "start" | "end">) => setStore(current => {
    const next = { ...(current.entries[dateKey] || emptyEntry()), ...patch };
    next.hours = hoursBetween(next.start, next.end);
    return { ...current, submissions: reopenCurrentWeek(current), entries: { ...current.entries, [dateKey]: next } };
  });
  const changeWeek = (amount: number) => setWeekStart(current => addDays(current, amount * 7));
  const addLeave = () => {
    setLeaveDraftError("");
    if (!leaveDraft.start || !leaveDraft.end || leaveDraft.end < leaveDraft.start) return;
    if (leaveDraft.type === "flexi" && (!store.contractedHoursPerDay || store.contractedHoursPerDay <= 0)) {
      setLeaveDraftError("Add your contracted hours per day in Settings before booking flexi leave.");
      return;
    }
    if (leaveDraft.type === "flexi" && !isRangeWithinFlexiPeriod(leaveDraft.start, leaveDraft.end, store.flexiPeriod, today)) {
      setLeaveDraftError(`Flexi leave can only be booked within the current ${store.flexiPeriod === "quarterly" ? "quarter" : "month"}.`);
      return;
    }
    setStore(current => ({ ...current, leave: [...current.leave, { id: crypto.randomUUID(), ...leaveDraft }] }));
  };
  const editAllowance = () => {
    setAllowanceDraft(String(store.allowance));
    setAllowanceError("");
    setAllowanceUpdated(false);
    setAllowanceEditing(true);
  };
  const cancelAllowanceEdit = () => {
    setAllowanceError("");
    setAllowanceEditing(false);
  };
  const saveAllowance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateAnnualAllowance(allowanceDraft);
    if (result.error) {
      setAllowanceError(result.error);
      return;
    }
    setStore(current => ({ ...current, allowance: result.value }));
    setAllowanceError("");
    setAllowanceEditing(false);
    setAllowanceUpdated(true);
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `leavebird-backup-${keyOf(new Date())}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const importData = async (file?: File) => {
    if (!file) return; try { const parsed = JSON.parse(await file.text()); setStore(normaliseStore(parsed)); } catch { alert("That backup file could not be read."); }
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
    const blob = new Blob([buildTimesheetCsv(heading, rows)], { type: "text/csv;charset=utf-8" });
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
  const saveEmployerUrl = () => {
    const url = normaliseEmployerUrl(employerUrlDraft);
    if (url === null) { setEmployerUrlError("Enter a valid web address beginning with https:// or http://. Sign-in details cannot be included."); return; }
    setStore(current => ({ ...current, employerUrl: url })); setEmployerUrlDraft(url); setEmployerUrlError("");
  };
  const removeEmployerUrl = () => { setStore(current => ({ ...current, employerUrl: "" })); setEmployerUrlDraft(""); setEmployerUrlError(""); };
  const dismissDailyChirp = () => {
    try { localStorage.setItem(chirpDismissalKey, "1"); } catch { /* dismissal remains in memory for this visit */ }
    setChirpVisible(false);
  };

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
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Settings</button>
        </nav>
        <div className={`save-state ${savedFlash ? "saving" : ""} ${saveStatus === "error" ? "failed" : ""}`}><span>●</span> {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : "Saved securely"}</div>
        <div className="account-menu"><span>{user.email}</span><button onClick={signOut}>Sign out</button></div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">YOUR TIME, YOURS</p><h1>{tab === "leave" ? "Plan the escape." : tab === "history" ? "The bigger picture." : tab === "settings" ? "Set your rhythm." : "Get the week done."}</h1><p className="lede">{tab === "leave" ? "Keep your allowance honest and your next adventure visible." : tab === "settings" ? "Tell Leavebird your working week and we’ll keep your flexi balance in view." : "A calmer way to log the hours — and keep the weekend in sight."}</p></div>
        <div className="hero-stats">
          <div><span>This week</span><strong>{fmt(weekTotal)}</strong></div>
          <div><span>Leave year</span><strong>{fmt(fyTotal)}</strong></div>
          <FlexiStat label={selectedFlexiLabel} balance={selectedFlexi.balance} configured={flexiConfigured} />
          <div className="sun-stat"><span>Leave left</span><strong>{leaveRemaining}d</strong></div>
        </div>
      </section>

      {(tab === "week" || tab === "history") && (
        <section className="mode-bar">
          <div><span className="tiny-label">RECORD BY</span><div className="segmented" role="group" aria-label="Time entry mode"><button className={store.mode === "clock" ? "selected" : ""} onClick={() => setStore(s => ({ ...s, mode: "clock" }))}>Start & finish</button><button className={store.mode === "hours" ? "selected" : ""} onClick={() => setStore(s => ({ ...s, mode: "hours" }))}>Number of hours</button></div></div>
          <p>Breaks are entered in minutes and subtracted from each day. Number-of-hours mode accepts decimals.</p>
        </section>
      )}

      {tab === "week" && <>
        <section className={`panel sheet-panel ${store.mode}`}>
          <div className="panel-heading"><div><p className="eyebrow coral">WEEKLY TIMESHEET</p><h2>{shortDate(weekStart)} — {fullDate(addDays(weekStart, 6))}</h2></div><div className="week-nav"><button onClick={() => changeWeek(-1)} aria-label="Previous week">←</button><button onClick={() => setWeekStart(mondayOf(new Date()))}>Today</button><button onClick={() => changeWeek(1)} aria-label="Next week">→</button></div></div>
          <div className="sheet-head"><span>Day</span><span>{store.mode === "clock" ? "Start" : "Hours"}</span>{store.mode === "clock" && <span>Finish</span>}<span>Break (min)</span><span>Note</span><span>Total</span></div>
          <div className="sheet-rows">
            {days.map(day => { const key = keyOf(day); const entry = store.entries[key] || emptyEntry(); const weekend = [0, 6].includes(day.getDay()); const dayName = day.toLocaleDateString("en-GB", { weekday: "long" }); return <div className={`day-row ${weekend ? "weekend" : ""}`} key={key}>
              <div className="day-name"><b>{day.toLocaleDateString("en-GB", { weekday: "short" })}</b><span>{day.getDate()}</span></div>
              {store.mode === "clock" ? <><TimeField id={`start-${key}`} label="Start" dayName={dayName} value={entry.start} onChange={start => updateClockEntry(key, { start })} /><TimeField id={`finish-${key}`} label="Finish" dayName={dayName} value={entry.end} onChange={end => updateClockEntry(key, { end })} /></> : <label><span className="mobile-only">Hours</span><input type="number" min="0" step="0.25" value={entry.hours || ""} placeholder="0" onChange={e => updateEntry(key, { hours: Number(e.target.value) })} /></label>}
              <label><span className="mobile-only">Break (min)</span><input type="number" min="0" step="1" value={entry.breakHours ? Number((entry.breakHours * 60).toFixed(2)) : ""} placeholder="0" aria-label={`Break in minutes for ${day.toLocaleDateString("en-GB", { weekday: "long" })}`} onChange={e => updateEntry(key, { breakHours: Number(e.target.value) / 60 })} /></label>
              <label className="note-field"><span className="mobile-only">Note</span><input value={entry.note} placeholder={weekend ? "Weekend plans?" : "What did you work on?"} onChange={e => updateEntry(key, { note: e.target.value })} /></label>
              <strong className="row-total">{fmt(netHours(entry, store.mode))}</strong>
            </div>; })}
          </div>
          <div className="sheet-total"><div><span>Week total</span><strong>{fmt(weekTotal)}</strong></div><button type="button" className="sheet-export-shortcut" onClick={downloadCsv} disabled={weekGross === 0}><span aria-hidden="true">↓</span><span><b>Download spreadsheet</b><small>.CSV · Excel, Google Sheets &amp; Numbers</small></span></button></div>
        </section>
        {chirpVisible && <section className="panel daily-chirp" aria-labelledby="daily-chirp-title" aria-live="polite">
          <div className="daily-chirp-art"><Image src={dailyChirp.image} alt={dailyChirp.alt} width={768} height={768} sizes="(max-width: 640px) calc(100vw - 24px), (max-width: 900px) 280px, 330px" /></div>
          <div className="daily-chirp-copy">
            <p className="eyebrow coral">TODAY’S DAILY CHIRP</p>
            <h2 id="daily-chirp-title">{dailyChirp.caption}</h2>
            <p>Your time is safely logged. A different chirp will land tomorrow.</p>
            <span>Chirp {dailyChirp.id} of 60</span>
          </div>
          <button type="button" className="daily-chirp-close" onClick={dismissDailyChirp} aria-label="Dismiss today’s Daily Chirp">×</button>
        </section>}
        <section className={`panel completion-panel ${currentSubmission ? "submitted" : weekReady ? "ready" : "review"}`}>
          <div className="completion-copy">
            <p className="eyebrow coral">{currentSubmission ? "SUBMITTED" : "READY TO HAND OVER"}</p>
            <h2>{currentSubmission ? "This week is marked as submitted." : weekReady ? "Your week is ready to submit." : "A quick check before you submit."}</h2>
            <p>{currentSubmission ? `Submitted ${new Date(currentSubmission.submittedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. Reopen it if you need to make a correction.` : "Review the totals, choose your employer's preferred hours format, then export the week."}</p>
            {!currentSubmission && weekChecks.errors.length > 0 && <ul className="check-list errors">{weekChecks.errors.map(error => <li key={error}>! {error}</li>)}</ul>}
            {!currentSubmission && weekChecks.missing.length > 0 && <p className="missing-note">Review: no hours recorded for {weekChecks.missing.join(", ")}.</p>}
          </div>
          <div className="completion-tools">
            <div className="total-strip"><div><span>Gross hours</span><strong>{fmt(weekGross)}</strong></div><div><span>Breaks</span><strong>{fmtMinutes(weekBreaks)}</strong></div><div><span>Payable</span><strong>{fmt(weekTotal)}</strong></div></div>
            <div className="format-choice"><span>Employer format</span><div className="segmented" role="group" aria-label="Employer hours format"><button className={store.hoursFormat === "decimal" ? "selected" : ""} onClick={() => setStore(current => ({ ...current, hoursFormat: "decimal" }))}>Decimal</button><button className={store.hoursFormat === "hhmm" ? "selected" : ""} onClick={() => setStore(current => ({ ...current, hoursFormat: "hhmm" }))}>HH:MM</button></div></div>
            <section className="timesheet-export" aria-labelledby="timesheet-export-heading">
              <div className="timesheet-export-heading"><div><span>EXPORT THIS WEEK</span><h3 id="timesheet-export-heading">Choose a file for your employer</h3></div><b>RECOMMENDED</b></div>
              <button type="button" className="csv-export-primary" onClick={downloadCsv} disabled={weekGross === 0}><span className="export-file-badge">CSV</span><span><strong>Download spreadsheet (.CSV)</strong><small>Opens in Excel, Google Sheets and Numbers</small></span><i aria-hidden="true">↓</i></button>
              <div className="secondary-exports"><button type="button" onClick={downloadPdf} disabled={weekGross === 0}><span>PDF</span><b>Download printable PDF</b></button><button type="button" onClick={copyWeek} disabled={weekGross === 0}><span>⌘</span><b>{copyStatus === "copied" ? "Copied timesheet rows ✓" : copyStatus === "error" ? "Copy failed — try again" : "Copy timesheet rows"}</b></button></div>
            </section>
            <div className="employer-shortcut"><div><span>Employer timesheet</span><small>Save the web address only — Leavebird never stores your employer login details.</small></div><div className="employer-url-controls"><input type="text" inputMode="url" aria-label="Employer timesheet web address" value={employerUrlDraft} placeholder="timesheets.your-employer.com" onChange={event => { setEmployerUrlDraft(event.target.value); setEmployerUrlError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); saveEmployerUrl(); } }} /><button type="button" onClick={saveEmployerUrl}>{savedEmployerUrl ? "Update link" : "Save link"}</button>{savedEmployerUrl && <button type="button" className="remove" onClick={removeEmployerUrl}>Remove</button>}</div>{employerUrlError && <p role="alert">{employerUrlError}</p>}</div>
            <div className="completion-actions">{savedEmployerUrl && <a className="employer-open" href={savedEmployerUrl} target="_blank" rel="noopener noreferrer">Open employer timesheet ↗</a>}{currentSubmission ? <button className="primary reopen" onClick={reopenWeek}>Reopen week</button> : <button className="primary" onClick={markSubmitted} disabled={!weekReady}>Mark as submitted ✓</button>}</div>
          </div>
        </section>
        <WeekendReward unlocked={Boolean(currentSubmission)} />
      </>}

      {tab === "history" && <>
        <section className="history-grid">
          <div className="panel history-panel"><div className="panel-heading"><div><p className="eyebrow coral">YOUR HISTORY</p><h2>Weeks on record</h2></div><span className="fy-pill">LY {fyStart.getFullYear()}/{String(fyEnd.getFullYear()).slice(-2)}</span></div>
            {historicalWeeks.length ? <div className="history-list">{historicalWeeks.map(([monday, total]) => { const submission = store.submissions?.[monday]; return <button key={monday} onClick={() => { setWeekStart(fromKey(monday)); setTab("week"); }}><span><b>{fullDate(fromKey(monday))}</b><small>Week ending {shortDate(addDays(fromKey(monday), 6))}</small>{submission && <><small className="submission-date">Submitted {new Date(submission.submittedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small><small className="submission-totals">Gross {fmt(submission.grossHours)} · Breaks {fmtMinutes(submission.breakHours)} · Payable {fmt(submission.netHours)} · {submission.format === "decimal" ? "Decimal" : "HH:MM"}</small></>}<em className={submission ? "submitted" : "draft"}>{submission ? "✓ Submitted" : "Draft"}</em></span><strong>{fmt(total)}</strong><i>→</i></button>; })}</div> : <div className="empty-state"><span>✦</span><h3>Your history starts here</h3><p>Add some hours to this week and they’ll appear here automatically.</p><button onClick={() => setTab("week")}>Log this week</button></div>}
          </div>
          <aside className="panel data-panel"><p className="eyebrow">SYNCED &amp; PRIVATE</p><h3>Your records follow you.</h3><p>Select any week from your history to review its hours and open the same spreadsheet and PDF export options used for this week.</p><div className="history-export-cue"><span aria-hidden="true">↗</span><strong>Open a week to export it</strong></div></aside>
        </section>
        <WeekendReward unlocked />
      </>}

      {tab === "settings" && (
        <section className="settings-layout">
          <section className="panel settings-card">
            <p className="eyebrow coral">WORK &amp; LEAVE SETTINGS</p>
            <h2>Your working year</h2>
            <p className="settings-intro">Set your weekly target, flexi period and the date when a fresh annual-leave allowance begins.</p>
            <div className="settings-fields">
              <div className="settings-field">
                <label htmlFor="contracted-hours">Contracted hours per week</label>
                <div className="contracted-hours-control">
                  <input id="contracted-hours" type="number" min="0.25" step="0.25" inputMode="decimal" value={store.contractedHoursPerWeek ?? ""} placeholder="37.5" aria-describedby="contracted-hours-help" onChange={event => setStore(current => ({ ...current, contractedHoursPerWeek: event.target.value === "" ? null : Number(event.target.value) }))} onBlur={() => setStore(current => ({ ...current, contractedHoursPerWeek: current.contractedHoursPerWeek && current.contractedHoursPerWeek > 0 ? current.contractedHoursPerWeek : null }))} />
                  <span>hours</span>
                </div>
              </div>
              <div className="settings-field">
                <label htmlFor="contracted-day-hours">Contracted hours per day</label>
                <div className="contracted-hours-control">
                  <input id="contracted-day-hours" type="number" min="0.25" step="0.25" inputMode="decimal" value={store.contractedHoursPerDay ?? ""} placeholder="7.5" aria-describedby="contracted-hours-help" onChange={event => setStore(current => ({ ...current, contractedHoursPerDay: event.target.value === "" ? null : Number(event.target.value) }))} onBlur={() => setStore(current => ({ ...current, contractedHoursPerDay: current.contractedHoursPerDay && current.contractedHoursPerDay > 0 ? current.contractedHoursPerDay : null }))} />
                  <span>hours</span>
                </div>
              </div>
            </div>
            <fieldset className="settings-leave-year">
              <legend>Leave year starts</legend>
              <div className="leave-year-controls">
                <label htmlFor="leave-year-month">Month<select id="leave-year-month" value={leaveYearParts.month} onChange={event => updateLeaveYearMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => index + 1).map(month => <option key={month} value={month}>{new Date(2000, month - 1, 1).toLocaleDateString("en-GB", { month: "long" })}</option>)}</select></label>
                <label htmlFor="leave-year-day">Day<select id="leave-year-day" value={leaveYearParts.day} onChange={event => updateLeaveYearDay(Number(event.target.value))}>{leaveYearDayOptions.map(day => <option key={day} value={day}>{day}</option>)}</select></label>
              </div>
              <div className="leave-year-summary">
                <span>Current leave year</span>
                <strong>{fullDate(fyStart)} — {fullDate(fyEnd)}</strong>
                <small>{store.leaveYearStart ? `Your allowance refreshes on ${formatLeaveYearStart(store.leaveYearStart)}.` : `Using Leavebird’s default of ${formatLeaveYearStart(DEFAULT_LEAVE_YEAR_START)}.`}</small>
                {store.leaveYearStart && <button type="button" onClick={() => setStore(current => ({ ...current, leaveYearStart: null }))}>Use default · 6 April</button>}
              </div>
            </fieldset>
            <section className="settings-allowance" aria-labelledby="annual-allowance-heading">
              <div className="settings-allowance-heading">
                <div><span>Annual leave</span><h3 id="annual-allowance-heading">Allowance in days</h3></div>
                {!allowanceEditing && <button type="button" className="allowance-edit" onClick={editAllowance}><span aria-hidden="true">✎</span> Edit allowance</button>}
              </div>
              <p className="allowance-help" id="annual-allowance-help">Your full paid-leave allowance for {fullDate(fyStart)} — {fullDate(fyEnd)}.</p>
              {allowanceEditing ? <form className="allowance-form" onSubmit={saveAllowance} noValidate>
                <label htmlFor="annual-allowance"><span>Allowance in days</span><span className="allowance-input"><input id="annual-allowance" type="number" min="0" max="366" step="0.5" inputMode="decimal" value={allowanceDraft} aria-describedby={`annual-allowance-help${allowanceError ? " annual-allowance-error" : ""}`} aria-invalid={Boolean(allowanceError)} onChange={event => { setAllowanceDraft(event.target.value); setAllowanceError(""); }} autoFocus /><small>days</small></span></label>
                {allowanceError && <p className="allowance-error" id="annual-allowance-error" role="alert">{allowanceError}</p>}
                <div className="allowance-actions"><button type="submit">Save allowance</button><button type="button" onClick={cancelAllowanceEdit}>Cancel</button></div>
              </form> : <div className="settings-allowance-value"><strong>{store.allowance}</strong><span>days per leave year</span></div>}
              {allowanceUpdated && <p className="allowance-updated" role="status">Allowance updated.</p>}
            </section>
            <fieldset className="settings-period">
              <legend>Flexi period</legend>
              <div className="segmented"><button type="button" className={store.flexiPeriod === "monthly" ? "selected" : ""} onClick={() => setStore(current => ({ ...current, flexiPeriod: "monthly" }))}>Monthly</button><button type="button" className={store.flexiPeriod === "quarterly" ? "selected" : ""} onClick={() => setStore(current => ({ ...current, flexiPeriod: "quarterly" }))}>Quarterly</button></div>
            </fieldset>
            <p id="contracted-hours-help" className="settings-help">Daily hours are used when you book flexi leave. Everything is saved securely to your account.</p>
            <section className="settings-backups" aria-labelledby="settings-backups-heading">
              <div><span>DATA &amp; BACKUPS</span><h3 id="settings-backups-heading">Your Leavebird data</h3></div>
              <p>JSON is a private Leavebird backup for restoring your records later. It is not a timesheet for your employer.</p>
              <div><button type="button" onClick={exportData}>↓ Download Leavebird backup (.JSON)</button><button type="button" className="secondary" onClick={() => importRef.current?.click()}>↑ Restore Leavebird backup (.JSON)</button></div>
              <input ref={importRef} type="file" accept="application/json" hidden onChange={e => importData(e.target.files?.[0])} />
            </section>
            {user.isAdmin && <div className="admin-dashboard-shortcut">
              <div>
                <span>OWNER TOOLS</span>
                <strong>Leavebird health dashboard</strong>
                <small>See growth, engagement, performance and service health. This shortcut is visible only to your owner account.</small>
              </div>
              <a href="/admin">Open dashboard <span aria-hidden="true">↗</span></a>
            </div>}
          </section>
          <aside className="panel flexi-explainer">
            <p className="eyebrow teal">HOW IT WORKS</p>
            <h3>Hours over or under, at a glance.</h3>
            <p>Leavebird compares your payable hours with your weekly target and uses your daily hours whenever you take flexi leave.</p>
            <div className="flexi-preview-row"><FlexiStat label={selectedFlexiLabel} balance={selectedFlexi.balance} configured={flexiConfigured} /></div>
            <ul><li>Your selected balance covers this whole {store.flexiPeriod === "quarterly" ? "quarter" : "month"}; unentered days stay neutral.</li><li>Days without entered timesheets are assumed to be worked at your contracted hours.</li><li>Annual leave and bank holidays do not count against you.</li><li>Each flexi-leave weekday deducts your contracted daily hours.</li></ul>
          </aside>
        </section>
      )}

      {tab === "leave" && <>
        <section className="leave-layout">
          <div className="panel calendar-panel">
            <div className="panel-heading"><div><p className="eyebrow teal">LEAVE CALENDAR</p><h2>{calendarMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2></div><div className="week-nav"><button onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>←</button><button onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>→</button></div></div>
            <div className="calendar-legend"><span><i className="annual" />Annual leave</span><span><i className="flexi" />Flexi leave</span><span><i className="holiday" />Bank holiday</span></div>
            <div className="calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <span key={d}>{d}</span>)}</div>
            <div className="calendar-grid">{monthGrid.map(day => { const key = keyOf(day); const booking = store.leave.find(item => item.start <= key && item.end >= key); const bankHoliday = bankHolidayByDate.get(key); const isToday = key === keyOf(new Date()); return <div key={key} className={`${day.getMonth() !== calendarMonth.getMonth() ? "muted" : ""} ${booking ? "booked" : ""} ${booking?.type === "flexi" ? "flexi-leave" : ""} ${bankHoliday ? "bank-holiday" : ""} ${isToday ? "today" : ""}`} aria-label={`${fullDate(day)}${booking ? `, ${booking.type === "flexi" ? "flexi leave" : "annual leave"}: ${booking.label}` : ""}${bankHoliday ? `, bank holiday: ${bankHoliday.title}` : ""}`}><span>{day.getDate()}</span>{bankHoliday && <small className="bank-holiday-name">{bankHoliday.title}</small>}{booking && <small className="leave-name">{booking.type === "flexi" ? "Flexi · " : ""}{booking.label}</small>}</div>; })}</div>

          </div>
          <aside className="leave-sidebar">
            <section className="panel holiday-settings"><p className="eyebrow teal">BANK HOLIDAYS</p><label htmlFor="bank-holiday-division">Your UK nation<select id="bank-holiday-division" value={store.bankHolidayDivision} onChange={event => setStore(current => ({ ...current, bankHolidayDivision: event.target.value as BankHolidayDivision }))}><option value="england-and-wales">England &amp; Wales</option><option value="scotland">Scotland</option><option value="northern-ireland">Northern Ireland</option></select></label><p>{bankHolidayStatus === "loading" ? "Loading official dates…" : bankHolidayStatus === "error" ? "Official dates are temporarily unavailable. Allowance totals will update when they return." : `${selectedBankHolidays.filter(holiday => holiday.date.slice(0, 4) === String(calendarMonth.getFullYear())).length} official dates loaded for ${calendarMonth.getFullYear()}.`}</p><a href="https://www.gov.uk/bank-holidays" target="_blank" rel="noopener noreferrer">Dates from GOV.UK ↗</a></section>
            <section className="panel time-off-summary" aria-labelledby="time-off-summary-heading">
              <div className="time-off-summary-heading"><span aria-hidden="true">☀</span><div><p className="eyebrow">YOUR TIME OFF</p><h3 id="time-off-summary-heading">Time off at a glance</h3></div></div>
              <div className="time-off-summary-grid">
                <article className="remaining"><span>Annual remaining</span><strong>{leaveRemaining}<small>d</small></strong><p>of {store.allowance} days</p></article>
                <article><span>Annual booked</span><strong>{annualLeaveTaken}<small>d</small></strong><p>this leave year</p></article>
                <article className="flexi"><span>Flexi this period</span><strong>{flexiTakenThisPeriod}<small>d</small></strong><p>this {store.flexiPeriod === "quarterly" ? "quarter" : "month"}</p></article>
                <article className="flexi"><span>Flexi this year</span><strong>{flexiTakenThisYear}<small>d</small></strong><p>{today.getFullYear()} calendar year</p></article>
              </div>
              <div className="time-off-summary-foot"><span>Leave year</span><strong>{shortDate(fyStart)} — {shortDate(fyEnd)}</strong></div>
            </section>

            <section className="panel book-card"><p className="eyebrow coral">BOOK TIME OFF</p><div className="leave-type-choice segmented" role="group" aria-label="Leave type"><button type="button" className={leaveDraft.type === "annual" ? "selected" : ""} onClick={() => { setLeaveDraft(d => ({ ...d, type: "annual", label: d.label === "Flexi leave" ? "Annual leave" : d.label })); setLeaveDraftError(""); }}>Annual leave</button><button type="button" className={leaveDraft.type === "flexi" ? "selected" : ""} onClick={() => { const valid = isRangeWithinFlexiPeriod(leaveDraft.start, leaveDraft.end, store.flexiPeriod, today); setLeaveDraft(d => ({ ...d, type: "flexi", start: valid ? d.start : keyOf(today), end: valid ? d.end : keyOf(today), label: d.label === "Annual leave" ? "Flexi leave" : d.label })); setLeaveDraftError(""); }}>Flexi leave</button></div><label>From<input type="date" min={leaveDraft.type === "flexi" ? currentFlexiPeriodStartKey : undefined} max={leaveDraft.type === "flexi" ? currentFlexiPeriodEndKey : undefined} value={leaveDraft.start} onChange={e => { setLeaveDraft(d => ({ ...d, start: e.target.value, end: e.target.value > d.end ? e.target.value : d.end })); setLeaveDraftError(""); }} /></label><label>To<input type="date" min={leaveDraft.start} max={leaveDraft.type === "flexi" ? currentFlexiPeriodEndKey : undefined} value={leaveDraft.end} onChange={e => { setLeaveDraft(d => ({ ...d, end: e.target.value })); setLeaveDraftError(""); }} /></label>{leaveDraft.type === "flexi" && <p className="flexi-booking-note">Book within {fullDate(currentFlexiPeriod.start)} — {fullDate(currentFlexiPeriod.end)}. Each weekday uses {store.contractedHoursPerDay ? fmt(store.contractedHoursPerDay) : "your daily hours"}.</p>}<label>What’s the plan?<input value={leaveDraft.label} onChange={e => setLeaveDraft(d => ({ ...d, label: e.target.value }))} /></label>{leaveDraftError && <p className="booking-error" role="alert">{leaveDraftError}</p>}<button onClick={addLeave}>Add to calendar ↗</button></section>

            {store.leave.length > 0 && <section className="panel booked-list"><p className="eyebrow">UPCOMING</p>{store.leave.slice().sort((a, b) => a.start.localeCompare(b.start)).map(item => <div key={item.id}><span><b>{item.label}</b><small>{item.type === "flexi" ? "Flexi leave · " : "Annual leave · "}{shortDate(fromKey(item.start))}{item.end !== item.start ? ` — ${shortDate(fromKey(item.end))}` : ""}</small></span><button onClick={() => setStore(s => ({ ...s, leave: s.leave.filter(l => l.id !== item.id) }))} aria-label={`Remove ${item.label}`}>×</button></div>)}</section>}

          </aside>
        </section>
        <section className="panel optimisation-panel"><div className="optimisation-heading"><div><p className="eyebrow coral">MAKE LEAVE GO FURTHER</p><h2>Longer breaks, fewer leave days.</h2></div><span>{divisionLabels[store.bankHolidayDivision]}</span></div>{bankHolidayStatus === "loading" ? <p className="optimisation-status">Finding the best upcoming combinations…</p> : bankHolidayStatus === "error" ? <p className="optimisation-status">We’ll show leave opportunities when the official dates are available again.</p> : leaveOpportunities.length ? <div className="opportunity-cards">{leaveOpportunities.map(opportunity => <article key={opportunity.id}><div className="opportunity-score"><strong>{opportunity.totalDays}</strong><span>days off</span></div><div><small>{opportunity.title}</small><h3>Use {opportunity.leaveDays} leave {opportunity.leaveDays === 1 ? "day" : "days"} for {opportunity.totalDays} days off</h3><p>{fullDate(fromKey(opportunity.start))} — {fullDate(fromKey(opportunity.end))}</p><button onClick={() => setLeaveDraft({ start: opportunity.start, end: opportunity.end, label: `${opportunity.title} break`, type: "annual" })}>Plan these dates ↗</button></div></article>)}</div> : <p className="optimisation-status">You’ve already covered the best upcoming bank-holiday opportunities. Nicely planned.</p>}</section>
        <Deals kind="holiday" />
      </>}

      <footer><span><b>Leavebird</b> · your time stays yours</span><span>Securely synced to your account</span></footer>
    </main>
  );
}

function oauthErrorMessage(code: string | null, provider: string | null) {
  const name = provider === "google" ? "Google" : "your provider";
  const messages: Record<string, string> = {
    cancelled: `Sign-in with ${name} was cancelled. You can try again or use your email and password.`,
    unavailable_email: `${name} did not provide a verified email address. Allow email sharing, or use email and password instead.`,
    account_conflict: `That ${name} identity cannot be linked automatically. Sign in another way or contact support.`,
    configuration: `${name} sign-in is not configured yet. Use email and password for now.`,
    expired: "That sign-in attempt expired. Please start again.",
    failed: `We could not complete sign-in with ${name}. Please try again.`,
  };
  return code ? messages[code] ?? messages.failed : "";
}
function initialOAuthError() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return oauthErrorMessage(params.get("auth_error"), params.get("provider"));
}


function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialOAuthError);
  const [busy, setBusy] = useState(false);
  const [oauthAvailability, setOAuthAvailability] = useState<OAuthAvailability | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("auth_error")) return;
    params.delete("auth_error");
    params.delete("provider");
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/oauth/status")
      .then(response => response.ok ? response.json() as Promise<OAuthAvailability> : Promise.reject())
      .then(availability => { if (!cancelled) setOAuthAvailability(availability); })
      .catch(() => { if (!cancelled) setOAuthAvailability({ google: false }); });
    return () => { cancelled = true; };
  }, []);

  const googleButton = () => {
    const content = <><FcGoogle aria-hidden="true" />Continue with Google</>;
    if (oauthAvailability?.google) {
      return <a className="oauth-button google" href="/api/auth/oauth/google/start">{content}</a>;
    }
    return <button type="button" className="oauth-button google" disabled={!oauthAvailability} onClick={() => setError("Google sign-in has not been connected to this Leavebird environment yet. Please use email and password for now.")}>
      {content}
    </button>;
  };

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
      <div className="oauth-buttons" aria-label="Sign in with another provider">
        {googleButton()}
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="auth-divider"><span>or use email</span></div>
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <label>Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 10 : undefined} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /></label>
      <button className="auth-submit" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in ↗" : "Create account ↗"}</button>
      <p className="auth-switch">{mode === "login" ? "New to Leavebird?" : "Already have an account?"} <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account!" : "Sign in"}</button></p>
    </form></section>
  </main>;
}

function WeekendReward({ unlocked }: { unlocked: boolean }) {
  const offers = [
    {
      id: "groupon-big-belly", type: "Comedy & brunch", title: "Big Belly Comedy Club", location: "South Bank, London",
      price: "From £24.95", saving: "Up to 50% off", availability: "Weekend sessions listed", source: "Groupon",
      image: "/deals/comedy.jpg",
      imageAlt: "A comedian performing with a microphone", credit: "Photo: James Cridland · CC BY 2.0",
    },
    {
      id: "wowcher-moco", type: "Art & culture", title: "Moco Museum entry", location: "Marble Arch, London",
      price: "From £9", saving: "Up to 43% off", availability: "Open Fri–Sat until 7pm", source: "Wowcher",
      image: "/deals/moco.jpg",
      imageAlt: "Inside Moco Museum in London", credit: "Photo: Matt Brown · CC BY 2.0",
    },
    {
      id: "wowcher-thames", type: "Sightseeing", title: "Thames sightseeing cruise", location: "Central London piers",
      price: "From £7", saving: "Up to 32% off", availability: "Runs Sat & Sun · every 20–40 min", source: "Wowcher",
      image: "/deals/thames.jpg",
      imageAlt: "A City Cruises boat on the River Thames", credit: "Photo: Cnbrb · public domain",
    },
  ];

  if (!unlocked) return <section className="weekend-teaser" aria-label="Weekend ideas locked until submission">
    <div className="teaser-icon" aria-hidden="true">✦</div>
    <div><p className="eyebrow">YOUR REWARD IS WAITING</p><h2>Weekend ideas unlock when the week is done.</h2><p>Mark this timesheet as submitted and we’ll reveal three timely ways to make your time off count.</p></div>
    <span className="teaser-lock">LOCKED · FOR NOW</span>
  </section>;

  return <section className="weekend-reward">
    <div className="reward-celebration">
      <div><p className="eyebrow">TIMESHEET DONE</p><h2>Weekend unlocked.</h2><p>You clocked the hours. Here are three ways to spend the good ones.</p></div>
      <span className="reward-stamp" aria-hidden="true">OFF<br />DUTY</span>
    </div>
    <div className="reward-heading"><div><p className="eyebrow coral">THIS WEEKEND · LONDON</p><h3>Something fun, sorted.</h3></div><span>Prices checked 2 Aug · availability can change · anonymous views and clicks help improve these picks</span></div>
    <div className="reward-cards">{offers.map(offer => <article key={offer.title} className="reward-card">
      <div className="reward-image"><img src={offer.image} alt={offer.imageAlt} /><small>{offer.credit}</small><span>{offer.saving}</span></div>
      <div className="reward-card-body"><p className="reward-type">{offer.type}</p><h4>{offer.title}</h4><p className="reward-location">⌖ {offer.location}</p><div className="reward-meta"><strong>{offer.price}</strong><span>✓ {offer.availability}</span></div><TrackedOfferLink offerId={offer.id} placement="timesheet-reward">View deal on {offer.source} <i>↗</i></TrackedOfferLink></div>
    </article>)}</div>
  </section>;
}

function Deals({ kind }: { kind: "weekend" | "holiday" }) {
  const deals = kind === "weekend" ? [
    { id: "wowcher-activities", tag: "WEEKEND IDEA", icon: "🎟", title: "Comedy, cocktails & no calendar invites", copy: "Hunt down a last-minute night out near you.", source: "Wowcher" },
    { id: "groupon-activities", tag: "LOCAL ESCAPE", icon: "🧗", title: "Try something you’ll mention on Monday", copy: "Activities, food and small adventures for two.", source: "Groupon" },
  ] : [
    { id: "lastminute-holidays", tag: "PACK LIGHT", icon: "🌊", title: "Turn three leave days into a proper escape", copy: "Browse spontaneous city and beach breaks.", source: "lastminute.com" },
    { id: "holidaypirates-home", tag: "DEAL SPOTTED", icon: "✈", title: "The long weekend is calling", copy: "Fresh travel deals and delightfully cheap flights.", source: "HolidayPirates" },
  ];
  const placement = kind === "weekend" ? "weekend-board" : "holiday-board";
  return <section className={`deals ${kind}`}><div className="deals-title"><div><p className="eyebrow">{kind === "weekend" ? "LEAVEBIRD PICKS" : "ESCAPE BOARD"}</p><h2>{kind === "weekend" ? "Make the weekend count." : "Give those leave days somewhere to go."}</h2></div><span>Handy links · not sponsored · anonymous views and clicks help improve these picks</span></div><div className="deal-cards">{deals.map(deal => <TrackedOfferLink key={deal.source} offerId={deal.id} placement={placement}><div className="deal-icon">{deal.icon}</div><div><small>{deal.tag}</small><h3>{deal.title}</h3><p>{deal.copy}</p><b>Browse on {deal.source} <i>↗</i></b></div></TrackedOfferLink>)}</div></section>;
}
