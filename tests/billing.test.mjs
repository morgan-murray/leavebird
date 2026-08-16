import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BILLING, billingValidationErrors, calculateInvoiceTotals, invoiceNumberForWeek, normaliseBilling } from "../lib/billing.js";

test("normalises legacy records to timesheet mode with safe invoice defaults", () => {
  assert.deepEqual(normaliseBilling(), DEFAULT_BILLING);
  assert.equal(normaliseBilling({ documentType: "unexpected", rate: -1 }).documentType, "timesheet");
});

test("calculates hourly invoice net, VAT and total", () => {
  const result = calculateInvoiceTotals({
    rows: [{ payable: 7.5 }, { payable: 8 }, { payable: 0 }],
    rateType: "hourly",
    rate: 50,
    vatEnabled: true,
    vatRate: 20,
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.net, 775);
  assert.equal(result.vat, 155);
  assert.equal(result.total, 930);
});

test("calculates daily invoices from days containing payable time", () => {
  const result = calculateInvoiceTotals({ rows: [{ payable: 7.5 }, { payable: 3 }, { payable: 0 }], rateType: "daily", rate: 400, vatEnabled: false, vatRate: 20 });
  assert.equal(result.net, 800);
  assert.equal(result.vat, 0);
  assert.equal(result.total, 800);
});

test("reuses a week's invoice number and allocates the next sequential number once", () => {
  const billing = normaliseBilling({ invoicePrefix: "LB-", nextInvoiceNumber: 12, invoiceNumbers: { "2026-08-03": "LB-0011" } });
  assert.deepEqual(invoiceNumberForWeek(billing, "2026-08-03"), { invoiceNumber: "LB-0011", nextInvoiceNumber: 12, isNew: false });
  assert.deepEqual(invoiceNumberForWeek(billing, "2026-08-10"), { invoiceNumber: "LB-0012", nextInvoiceNumber: 13, isNew: true });
});

test("requires invoice payment and VAT details only when applicable", () => {
  const timesheet = normaliseBilling({ supplierName: "Alex", customerName: "Client", customerAddress: "London" });
  assert.deepEqual(billingValidationErrors(timesheet), []);
  const invoice = normaliseBilling({ ...timesheet, documentType: "invoice", vatEnabled: true });
  assert.match(billingValidationErrors(invoice).join(" "), /business address/);
  assert.match(billingValidationErrors(invoice).join(" "), /contact email/);
  assert.match(billingValidationErrors(invoice).join(" "), /VAT registration number/);
});
