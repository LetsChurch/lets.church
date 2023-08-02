import prettyBytes from 'pretty-bytes';
import humanFormat from 'human-format';
import { useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import { gql } from 'graphql-request';
import type {
  AboutPageDataQuery,
  AboutPageDataQueryVariables,
} from './__generated__/(about)';
import A from '~/components/content/a';
import H1 from '~/components/content/h1';
import H2 from '~/components/content/h2';
import P from '~/components/content/p';
import ExternalLink from '~/components/external-link';
import { client } from '~/util/gql/server';

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
            totalUploads
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
          is also open source and dedicated to the public domain. Our philosophy
          behind how we operate is best captured in the book{' '}
          <ExternalLink href="https://thedoreanprinciple.org/">
            The Dorean Principle
          </ExternalLink>
          .
        </P>
        <H2 id="accounts-and-membership">No Ads</H2>
        <P>
          Let's Church, as a company, will never run ads on principle. We rely
          entirely on <A href="#support">support</A> from our users.
        </P>
        <H2 id="support">Support Let's Church</H2>
        <P>
          <A href="/about">
            Let's Church is a 501(c)(3) non-profit organization
          </A>
          . We provide our services completely free of charge and will never run
          ads. Your contribution helps pay for improvement of our platform,
          hosting fees, storage, and the hardware necessary to encode and
          transcribe audio and videos for the benefit of churches and ministries
          around the world. All donations are tax-deductible in the United
          States.
        </P>
        <P class="flex justify-center">
          <a
            href="https://www.zeffy.com/en-US/donation-form/5da9e1c3-a8e2-4bb4-817a-5dbbb968ec6b"
            class="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            target="_blank"
          >
            Donate to Let's Church
          </a>
        </P>
        <P>
          Please do not let any giving to Let's Church interfere with giving to
          your local church. It is important that you first support your local
          community of believers before prayerfully considering how much you can
          give to Let's Church.
        </P>
        <H2>Spread the Word</H2>
        <P>
          Another way you can support Let's Church is by spreading the word.
          Share our website, share our social media, share sermons, videos, and
          podcasts that have been helpful or edifying to you. If you know of any
          churches or ministires in need of free sermon or media hosting, send
          them our way!
        </P>
        <dl class="mt-36 grid grid-cols-1 gap-x-8 gap-y-16 text-center lg:grid-cols-3">
          <div class="mx-auto flex max-w-xs flex-col gap-y-4">
            <dt class="text-base leading-7 text-gray-600">Hosted Content</dt>
            <dd class="order-first text-3xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
              {prettyBytes(data()?.stats.storageBytes ?? 0)}
            </dd>
          </div>
          <div class="mx-auto flex max-w-xs flex-col gap-y-4">
            <dt class="text-base leading-7 text-gray-600">Uploads</dt>
            <dd class="order-first text-3xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
              {humanFormat(data()?.stats.totalUploads ?? 0)}
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
