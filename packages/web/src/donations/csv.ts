const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function donationCsvCell(value: string | number | null) {
  const text = value == null ? '' : String(value);
  const safeText = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}
