import { Outlet } from 'solid-start';
// https://github.com/nksaraf/solid-mdx/issues/2
/* eslint-disable import/no-unresolved */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { MDXProvider } from 'solid-mdx';
/* eslint-enable import/no-unresolved */
import A from '~/components/content/a';

export default function AboutLayout() {
  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="prose mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <MDXProvider
          components={{
            a: A,
          }}
        >
          <Outlet />
        </MDXProvider>
      </div>
    </div>
  );
}
