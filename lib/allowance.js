/**
 * Validate an annual leave allowance entered in days.
 *
 * @param {string} input
 * @returns {{ value: number, error: string }}
 */
export function validateAnnualAllowance(input) {
  const trimmed = input.trim();
  if (!trimmed) return { value: 0, error: "Enter your annual leave allowance." };

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { value: 0, error: "Enter a valid number of days." };
  if (value < 0 || value > 366) return { value: 0, error: "Allowance must be between 0 and 366 days." };
  if (!Number.isInteger(value * 2)) return { value: 0, error: "Use whole or half days, such as 25 or 25.5." };

  return { value, error: "" };
}
