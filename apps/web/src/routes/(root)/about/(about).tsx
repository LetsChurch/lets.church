import A from '~/components/content/a';
import H1 from '~/components/content/h1';
import H2 from '~/components/content/h2';
import P from '~/components/content/p';
import ExternalLink from '~/components/external-link';

export default function AboutRoute() {
  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <H1>All About Let's Church</H1>
        <P>
          Let's Church is a non-profit organization (501c3 pending) dedicated to
          providing free technology resources to Churches and Christian
          Ministries. Our flagship offering is the site you are looking at right
          now: sermon and podcast hosting with fully-searchable transcripts 100%
          free of charge with no ads.
        </P>
        <H2 id="accounts-and-membership">The Public Domain</H2>
        <P>
          Not only is Let’s Church free to use, but{' '}
          <ExternalLink href="https://gitlab.com/letschurch/lets.church">
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
        <h2 class="mt-36 flex flex-col space-y-5 text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          <small>Ready?</small>
          <strong class="text-5xl font-bold">Let's Church</strong>
        </h2>
      </div>
    </div>
  );
}