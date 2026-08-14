const REDACTED_KEYS = new Set([
  'authorization',
  'confirmpassword',
  'cookie',
  'csv',
  'donoremail',
  'donorname',
  'email',
  'fullname',
  'hcaptchatoken',
  'identifier',
  'mappingcsv',
  'name',
  'newpassword',
  'password',
  'planscsv',
  'linkscsv',
  'refreshtoken',
  'secret',
  'streamkey',
  'token',
]);

export function redactLogInput(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) {
    return value.map((entry) => redactLogInput(entry, depth + 1));
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      REDACTED_KEYS.has(key.toLowerCase())
        ? '[REDACTED]'
        : redactLogInput(entry, depth + 1),
    ]),
  );
}
