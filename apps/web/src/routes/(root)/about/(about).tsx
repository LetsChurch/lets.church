import prettyBytes from 'pretty-bytes';
import { useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import type {
  AboutPageDataQuery,
  AboutPageDataQueryVariables,
} from './__generated__/(about)';
import A from '~/components/content/a';
import H1 from '~/components/content/h1';
import H2 from '~/components/content/h2';
import P from '~/components/content/p';
import ExternalLink from '~/components/external-link';
import { client, gql } from '~/util/gql/server';

export function routeData() {
  const data = createServerData$(async () => {
    return await client.request<
      AboutPageDataQuery,
      AboutPageDataQueryVariables
    >(
      gql`
        query AboutPageData {
          stats {
            storageBytes
          }
        }
      `,
    );
  });

  return { data };
}

export default function AboutRoute() {
  const { data } = useRouteData<typeof routeData>();

  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <H1>All About Let's Church</H1>
        <P>
          Let's Church is a 501(c)(3) non-profit organization dedicated to
          providing free technology resources to Churches and Christian
          Ministries. Our flagship offering is the site you are looking at right
          now: sermon and media hosting with fully-searchable transcripts, 100%
          free of charge with no ads.
        </P>
        <H2 id="accounts-and-membership">The Public Domain</H2>
        <P>
          Not only is Let’s Church free to use, but{' '}
          <ExternalLink href="https://gitlab.com/letschurch">
            our code
          </ExternalLink>{' '}
          is also available and dedicated to the public domain. As Jesus said,
          "freely you received, freely give" (Matt. 10:8). Our philosophy behind
          this approach is best captured in the book{' '}
          <ExternalLink href="https://thedoreanprinciple.org/">
            The Dorean Principle
          </ExternalLink>
          .
        </P>
        <H2 id="accounts-and-membership">No Ads</H2>
        <P>
          Let's Church, as a company, will never run ads on principle. We rely
          entirely on <A href="/support">support</A> from our users.
        </P>
        <dl class="mt-36 grid grid-cols-1 gap-x-8 gap-y-16 text-center lg:grid-cols-3">
          <div class="mx-auto flex max-w-xs flex-col gap-y-4">
            <dt class="text-base leading-7 text-gray-600">Hosted Content</dt>
            <dd class="order-first text-3xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
              {prettyBytes(data()?.stats.storageBytes ?? NaN)}
            </dd>
          </div>
          <div class="mx-auto flex max-w-xs flex-col gap-y-4">
            <dt class="text-base leading-7 text-gray-600">Ads</dt>
            <dd class="order-first text-3xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
              0
            </dd>
          </div>
          <div class="mx-auto flex max-w-xs flex-col gap-y-4">
            <dt class="text-base leading-7 text-gray-600">No Cost</dt>
            <dd class="order-first text-3xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
              $0
            </dd>
          </div>
        </dl>
        <h2 class="mt-36 flex flex-col space-y-5 text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          <small>Ready?</small>
          <strong class="text-5xl font-bold text-indigo-500">
            Let's Church
          </strong>
        </h2>
      </div>
    </div>
  );
}
