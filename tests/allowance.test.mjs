import assert from "node:assert/strict";
import test from "node:test";
import { validateAnnualAllowance } from "../lib/allowance.js";

test("accepts whole and half-day annual allowances", () => {
  assert.deepEqual(validateAnnualAllowance("25"), { value: 25, error: "" });
  assert.deepEqual(validateAnnualAllowance(" 27.5 "), { value: 27.5, error: "" });
  assert.deepEqual(validateAnnualAllowance("0"), { value: 0, error: "" });
});

test("requires an annual allowance", () => {
  assert.equal(validateAnnualAllowance(" ").error, "Enter your annual leave allowance.");
});

test("rejects invalid, out-of-range, and partial-day values", () => {
  assert.equal(validateAnnualAllowance("days").error, "Enter a valid number of days.");
  assert.equal(validateAnnualAllowance("-1").error, "Allowance must be between 0 and 366 days.");
  assert.equal(validateAnnualAllowance("367").error, "Allowance must be between 0 and 366 days.");
  assert.equal(validateAnnualAllowance("25.25").error, "Use whole or half days, such as 25 or 25.5.");
});
