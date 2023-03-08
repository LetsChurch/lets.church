export function dateToIso8601(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDate(date: Date, ...locales: Array<string>) {
  return new Intl.DateTimeFormat([...locales, 'en-US']).format(date);
}

export function formatDateFull(date: Date, ...locales: Array<string>) {
  return new Intl.DateTimeFormat([...locales, 'en-US'], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
