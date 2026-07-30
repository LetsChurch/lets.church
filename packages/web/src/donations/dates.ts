export function donationStatementYear(date: Date) {
  return date.getUTCFullYear();
}

export function formatDonationDate(date: Date) {
  return date.toLocaleDateString('en-US', { timeZone: 'UTC' });
}
