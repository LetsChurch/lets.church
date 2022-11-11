import { test, expect } from 'vitest';
import { escapeDocument } from './xss';

test('escapeDocument', () => {
  expect(escapeDocument({})).toMatchInlineSnapshot('{}');
  expect(
    escapeDocument({
      foo: 'bar',
      html: '<video src="foo" />',
      array: [
        'hello',
        '<b>world</b>',
        '<oink />',
        { foo: 'bar', bears: '<bananas />' },
      ],
      object: { foo: 'bar', baz: 'ducks', bears: '<bananas />' },
    }),
  ).toMatchInlineSnapshot(`
    {
      "array": [
        "hello",
        "&lt;b&gt;world&lt;/b&gt;",
        "&lt;oink /&gt;",
        {
          "bears": "&lt;bananas /&gt;",
          "foo": "bar",
        },
      ],
      "foo": "bar",
      "html": "&lt;video src=\\"foo\\" /&gt;",
      "object": {
        "baz": "ducks",
        "bears": "&lt;bananas /&gt;",
        "foo": "bar",
      },
    }
  `);
});
