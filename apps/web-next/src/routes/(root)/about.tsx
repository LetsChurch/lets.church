import { ParentProps } from 'solid-js';
// https://github.com/nksaraf/solid-mdx/issues/2
// eslint-disable-next-line @typescript-eslint/ban-ts-comment, import/no-unresolved
import { MDXProvider } from 'solid-mdx';
import P from '~/components/content/p';
import A from '~/components/content/a';
import H1 from '~/components/content/h1';
import H2 from '~/components/content/h2';
import H3 from '~/components/content/h3';
import H4 from '~/components/content/h4';
import { Ul, Ol } from '~/components/content/list';

export default function AboutLayout(props: ParentProps) {
  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <MDXProvider
          components={{
            p: P,
            a: A,
            h1: H1,
            h2: H2,
            h3: H3,
            h4: H4,
            ul: Ul,
            ol: Ol,
          }}
        >
          {props.children}
        </MDXProvider>
      </div>
    </div>
  );
}
