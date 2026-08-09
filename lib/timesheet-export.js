function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

/** Builds an Excel-friendly UTF-8 CSV document with quoted cells and CRLF rows. */
export function buildTimesheetCsv(heading, rows) {
  return `\uFEFF${[heading, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}`;
}
