import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { rehypeGlueCitations } from './answer-citation-glue';

const render = (md: string) =>
  String(
    unified()
      .use(remarkParse)
      .use(remarkRehype)
      .use(rehypeGlueCitations)
      .use(rehypeStringify)
      .processSync(md),
  );

const cite = (n: number) => `<a href="#lc-cite-${n}">${n}</a>`;
const wrap = (inner: string) =>
  `<span class="whitespace-nowrap">${inner}</span>`;

describe('rehypeGlueCitations', () => {
  it('glues a badge to the preceding word, dropping the space', () => {
    expect(render('how long it will last. [1](#lc-cite-1)')).toBe(
      `<p>how long it will ${wrap(`last.${cite(1)}`)}</p>`,
    );
  });

  it('keeps a run of badges together with the word', () => {
    expect(render('teaching [1](#lc-cite-1) [2](#lc-cite-2)')).toBe(
      `<p>${wrap(`teaching${cite(1)}${cite(2)}`)}</p>`,
    );
  });

  it('pulls trailing punctuation into the wrapper', () => {
    expect(render('peace [1](#lc-cite-1). Next')).toBe(
      `<p>${wrap(`peace${cite(1)}.`)} Next</p>`,
    );
  });

  it('glues to a preceding inline element', () => {
    expect(render('**bold** [1](#lc-cite-1)')).toBe(
      `<p>${wrap(`<strong>bold</strong>${cite(1)}`)}</p>`,
    );
  });

  it('wraps mid-paragraph badges and leaves other links alone', () => {
    expect(
      render('one [1](#lc-cite-1) two [x](/media/a) three [2](#lc-cite-2)'),
    ).toBe(
      `<p>${wrap(`one${cite(1)}`)} two <a href="/media/a">x</a> ${wrap(`three${cite(2)}`)}</p>`,
    );
  });
});
