import prettyMs from 'pretty-ms';

/**
 * Formats milliseconds to time format (HH:MM:SS or MM:SS)
 * @param ms - Duration in milliseconds
 * @returns Formatted time string with leading zeros
 */
export function formatTime(ms: number) {
  const res = prettyMs(ms, { colonNotation: true, secondsDecimalDigits: 0 });
  const sections = res.split(':').length;
  return res.padStart(sections * 2 + sections - 1, '0');
}

/**
 * Formats a date to a localized string in US format
 * @param date - Date object or ISO date string to format
 * @param monthFormat - Format for the month display ('long' for full month name, 'short' for abbreviated)
 * @returns Formatted date string (e.g., "January 1, 2024" or "Jan 1, 2024")
 */
export function formatDate(
  date: Date | string,
  monthFormat: 'long' | 'short' = 'long',
) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: monthFormat,
    day: 'numeric',
    timeZone: 'UTC',
  });
}
