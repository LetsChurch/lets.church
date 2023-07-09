import { test, expect } from 'vitest';
import { emailHtml } from './email';

test('formats html', () => {
  const res = emailHtml('This is a title', 'This is a body', false);
  expect(res.errors.length).toBe(0);
  expect(res.html).toMatchSnapshot();
});

test('handles multiple paragraphs', () => {
  const res = emailHtml(
    'This is a title',
    'This is a body\n\nThis is a second paragraph.\n\nThis is a third paragraph.\n',
    false,
  );
  expect(res.errors.length).toBe(0);
  expect(res.html).toMatchSnapshot();
});

test('minifies by default', () => {
  const res = emailHtml(
    'This is a title',
    'This is a body\n\nThis is a second paragraph.\n\nThis is a third paragraph.\n',
  );
  expect(res.errors.length).toBe(0);
  expect(res.html).toMatchSnapshot();
});
