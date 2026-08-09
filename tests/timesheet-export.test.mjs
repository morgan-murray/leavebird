import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTimesheetCsv } from "../lib/timesheet-export.js";

test("builds an Excel-friendly CSV with quoted cells and CRLF rows", () => {
  const csv = buildTimesheetCsv(["Date", "Note"], [["2026-08-03", "Planning"]]);
  assert.equal(csv, '\uFEFF"Date","Note"\r\n"2026-08-03","Planning"');
});

test("escapes commas, quotes and line breaks without corrupting columns", () => {
  const csv = buildTimesheetCsv(["Day", "Note"], [["Monday", 'Spoke to "Morgan", then\nplanned']]);
  assert.match(csv, /"Spoke to ""Morgan"", then\nplanned"/);
});

test("prioritises CSV before the Daily Chirp and in the handover panel", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const shortcut = page.indexOf("sheet-export-shortcut");
  const chirp = page.indexOf("daily-chirp-art");
  assert.ok(shortcut > 0 && shortcut < chirp);
  assert.match(page, /Download spreadsheet \(\.CSV\)/);
  assert.match(page, /RECOMMENDED/);
  assert.match(page, /Excel, Google Sheets and Numbers/);
});

test("labels JSON as a Leavebird backup inside Settings", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const history = page.slice(page.indexOf('{tab === "history" && <>'), page.indexOf('{tab === "settings" && ('));
  const settings = page.slice(page.indexOf('{tab === "settings" && ('), page.indexOf('{tab === "leave" && <>'));
  assert.doesNotMatch(history, /Export backup/);
  assert.match(settings, /Download Leavebird backup \(\.JSON\)/);
  assert.match(settings, /not a timesheet for your employer/);
});

test("keeps CSV first and full width on mobile", () => {
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.csv-export-primary\s*\{[^}]*width:100%/);
  assert.match(styles, /@media\(max-width:640px\)[\s\S]*\.sheet-export-shortcut\s*\{[^}]*width:100%/);
});

test("aligns both History cards to the full-width panel below", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /SYNCED &amp; PRIVATE/);
  assert.match(styles, /\.history-grid>\.panel\s*\{[^}]*width:100%[^}]*margin-left:0[^}]*margin-right:0/);
});
