import { ParentProps } from 'solid-js';
// @ts-expect-error: https://github.com/nksaraf/solid-mdx/issues/2
import { MDXProvider } from 'solid-mdx';
import A from '~/components/content/a';

export default function AboutLayout(props: ParentProps) {
  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="prose mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <MDXProvider
          components={{
            a: A,
          }}
        >
          {props.children}
        </MDXProvider>
      </div>
    </div>
  );
}
