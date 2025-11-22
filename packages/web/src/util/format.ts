import prettyMs from 'pretty-ms';

/**
 * Formats milliseconds to time format (H:MM:SS or M:SS)
 * @param ms - Duration in milliseconds
 * @returns Formatted time string without leading zeros on the most significant unit
 */
export function formatTime(ms: number) {
  const res = prettyMs(ms, { colonNotation: true, secondsDecimalDigits: 0 });
  const parts = res.split(':');

  // Don't pad the first (most significant) part, but pad all others to 2 digits
  return parts
    .map((part, index) => (index === 0 ? part : part.padStart(2, '0')))
    .join(':');
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
