import { describe, expect, test } from 'vitest';

import { formatDate, formatTime } from './format';

describe('formatTime', () => {
  test('formats seconds only (under 1 minute)', () => {
    expect(formatTime(32000)).toBe('0:32');
  });

  test('formats minutes and seconds (under 1 hour)', () => {
    expect(formatTime(92000)).toBe('1:32');
  });

  test('formats minutes and seconds with padded seconds', () => {
    expect(formatTime(65000)).toBe('1:05');
  });

  test('formats hours, minutes, and seconds', () => {
    expect(formatTime(5532000)).toBe('1:32:12');
  });

  test('formats hours with padded minutes and seconds', () => {
    expect(formatTime(3725000)).toBe('1:02:05');
  });

  test('formats double-digit hours', () => {
    expect(formatTime(36125000)).toBe('10:02:05');
  });

  test('formats zero duration', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  test('formats 1 second', () => {
    expect(formatTime(1000)).toBe('0:01');
  });

  test('formats 59 seconds', () => {
    expect(formatTime(59000)).toBe('0:59');
  });

  test('formats exactly 1 minute', () => {
    expect(formatTime(60000)).toBe('1:00');
  });

  test('formats exactly 1 hour', () => {
    expect(formatTime(3600000)).toBe('1:00:00');
  });

  test('formats 10 hours', () => {
    expect(formatTime(36000000)).toBe('10:00:00');
  });

  test('does not add leading zero to most significant unit (minutes)', () => {
    expect(formatTime(60000)).not.toBe('01:00');
  });

  test('does not add leading zero to most significant unit (hours)', () => {
    expect(formatTime(3600000)).not.toBe('01:00:00');
  });
});

describe('formatDate', () => {
  test('formats date with long month by default', () => {
    expect(formatDate('2024-01-15')).toBe('January 15, 2024');
  });

  test('formats date with short month when specified', () => {
    expect(formatDate('2024-01-15', 'short')).toBe('Jan 15, 2024');
  });

  test('formats Date object', () => {
    const date = new Date('2024-12-25T00:00:00Z');
    expect(formatDate(date)).toBe('December 25, 2024');
  });

  test('formats date string with long month', () => {
    expect(formatDate('2024-07-04', 'long')).toBe('July 4, 2024');
  });
});
