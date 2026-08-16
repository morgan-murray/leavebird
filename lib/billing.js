export const DEFAULT_BILLING = {
  documentType: "timesheet",
  supplierName: "",
  supplierAddress: "",
  supplierEmail: "",
  companyNumber: "",
  customerName: "",
  customerAddress: "",
  customerReference: "",
  invoicePrefix: "INV-",
  nextInvoiceNumber: 1,
  invoiceNumbers: {},
  paymentTermsDays: 14,
  rateType: "hourly",
  rate: null,
  bankAccountName: "",
  bankName: "",
  sortCode: "",
  accountNumber: "",
  iban: "",
  vatEnabled: false,
  vatNumber: "",
  vatRate: 20,
};

export function normaliseBilling(value = {}) {
  const merged = { ...DEFAULT_BILLING, ...(value || {}) };
  const strings = ["supplierName", "supplierAddress", "supplierEmail", "companyNumber", "customerName", "customerAddress", "customerReference", "invoicePrefix", "bankAccountName", "bankName", "sortCode", "accountNumber", "iban", "vatNumber"];
  strings.forEach(key => { merged[key] = typeof merged[key] === "string" ? merged[key] : ""; });
  return {
    ...merged,
    documentType: merged.documentType === "invoice" ? "invoice" : "timesheet",
    invoicePrefix: String(merged.invoicePrefix || "INV-").slice(0, 20),
    nextInvoiceNumber: Number.isInteger(Number(merged.nextInvoiceNumber)) && Number(merged.nextInvoiceNumber) > 0 ? Number(merged.nextInvoiceNumber) : 1,
    invoiceNumbers: merged.invoiceNumbers && typeof merged.invoiceNumbers === "object" ? merged.invoiceNumbers : {},
    paymentTermsDays: Number.isFinite(Number(merged.paymentTermsDays)) && Number(merged.paymentTermsDays) >= 0 ? Number(merged.paymentTermsDays) : 14,
    rateType: merged.rateType === "daily" ? "daily" : "hourly",
    rate: Number(merged.rate) > 0 ? Number(merged.rate) : null,
    vatEnabled: Boolean(merged.vatEnabled),
    vatRate: Number.isFinite(Number(merged.vatRate)) && Number(merged.vatRate) >= 0 ? Number(merged.vatRate) : 20,
  };
}

export function invoiceNumberForWeek(billing, weekKey) {
  const existing = billing.invoiceNumbers?.[weekKey];
  if (existing) return { invoiceNumber: existing, nextInvoiceNumber: billing.nextInvoiceNumber, isNew: false };
  return {
    invoiceNumber: `${billing.invoicePrefix}${String(billing.nextInvoiceNumber).padStart(4, "0")}`,
    nextInvoiceNumber: billing.nextInvoiceNumber + 1,
    isNew: true,
  };
}

export function calculateInvoiceTotals({ rows, rateType, rate, vatEnabled, vatRate }) {
  const numericRate = Number(rate) || 0;
  const items = rows.filter(row => Number(row.payable) > 0).map(row => {
    const quantity = rateType === "daily" ? 1 : Number(row.payable);
    return { ...row, quantity, amount: quantity * numericRate };
  });
  const net = items.reduce((sum, row) => sum + row.amount, 0);
  const vat = vatEnabled ? net * ((Number(vatRate) || 0) / 100) : 0;
  return { items, net, vat, total: net + vat };
}

export function billingValidationErrors(billing) {
  const errors = [];
  if (!billing.supplierName.trim()) errors.push("Add your name or business name in Billing settings.");
  if (!billing.customerName.trim()) errors.push("Add the customer name in Billing settings.");
  if (!billing.customerAddress.trim()) errors.push("Add the customer address in Billing settings.");
  if (billing.documentType !== "invoice") return errors;
  if (!billing.supplierAddress.trim()) errors.push("Add your business address in Billing settings.");
  if (!billing.supplierEmail.trim()) errors.push("Add a contact email in Billing settings.");
  if (!(Number(billing.rate) > 0)) errors.push(`Add a valid ${billing.rateType === "daily" ? "daily" : "hourly"} rate in Billing settings.`);
  if (!billing.invoicePrefix.trim()) errors.push("Add an invoice number prefix in Billing settings.");
  if (!billing.bankAccountName.trim()) errors.push("Add the bank account name in Billing settings.");
  if (!billing.sortCode.trim()) errors.push("Add the bank sort code in Billing settings.");
  if (!billing.accountNumber.trim()) errors.push("Add the bank account number in Billing settings.");
  if (billing.vatEnabled && !billing.vatNumber.trim()) errors.push("Add a VAT registration number or turn VAT off.");
  return errors;
}
