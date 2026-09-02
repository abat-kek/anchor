export type DateOptionValidation =
  | { ok: true }
  | { ok: false; reason: 'missing_dates' | 'end_before_start' | 'start_in_past' };

export function validateDateOptionInput(
  startDate: string,
  endDate: string,
  today: string,
): DateOptionValidation {
  if (!startDate || !endDate) return { ok: false, reason: 'missing_dates' };
  if (endDate < startDate) return { ok: false, reason: 'end_before_start' };
  if (startDate < today) return { ok: false, reason: 'start_in_past' };
  return { ok: true };
}
