import prettyMs from 'pretty-ms';

export function formatTime(ms: number) {
  const res = prettyMs(ms, { colonNotation: true, secondsDecimalDigits: 0 });
  const sections = res.split(':').length;
  return res.padStart(sections * 2 + sections - 1, '0');
}

export function formatDate(
  date: Date | string,
  monthFormat: 'long' | 'short' = 'long',
) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: monthFormat,
    day: 'numeric',
  });
}
