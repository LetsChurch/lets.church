import { createFileRoute, Link } from '@tanstack/react-router';
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '@/util/image-sizes';

export const Route = createFileRoute('/_main/about/')({
  component: RouteComponent,
  head: () => {
    const title = "About Let's Church - Free Christian Media Platform";
    const description =
      "Let's Church is a 501(c)(3) non-profit ministry providing free, ad-free media hosting for churches. Learn about our mission to make Scripture, sermons, and Christian media accessible to all.";
    const url =
      typeof window !== 'undefined'
        ? window.location.href
        : 'https://lets.church/about';

    return {
      meta: [
        {
          title,
        },
        {
          name: 'description',
          content: description,
        },
        {
          property: 'og:url',
          content: url,
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:title',
          content: title,
        },
        {
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:image',
          content: 'https://lets.church/og-image.png',
        },
        {
          property: 'og:image:width',
          content: '1280',
        },
        {
          property: 'og:image:height',
          content: '720',
        },
        {
          property: 'og:site_name',
          content: "Let's Church",
        },
        {
          name: 'twitter:card',
          content: 'summary_large_image',
        },
        {
          property: 'twitter:domain',
          content: 'lets.church',
        },
        {
          property: 'twitter:url',
          content: url,
        },
        {
          name: 'twitter:title',
          content: title,
        },
        {
          name: 'twitter:description',
          content: description,
        },
        {
          name: 'twitter:image',
          content: 'https://lets.church/og-image.png',
        },
      ],
      links: [
        {
          rel: 'canonical',
          href: 'https://lets.church/about',
        },
      ],
    };
  },
});

function RouteComponent() {
  return (
    <div className="prose prose-lg dark:prose-invert mx-auto max-w-4xl px-4 py-8">
      <h2>About Let's Church</h2>
      <p>
        <strong>Let's Church is not a business, it's a ministry.</strong> We
        don't charge for our services because we believe ministry resources
        should be supported by partners, not paid for by customers. This keeps
        the focus on serving churches rather than generating revenue, and
        ensures no one faces financial barriers to accessing sermons and
        Christian media.
      </p>

      <p>
        As a 501(c)(3) non-profit organization, our mission is to empower
        churches and Christian ministries worldwide by providing{' '}
        <strong>free</strong>, ad-free technology resources designed to amplify
        their message and make Scripture, sermons, and media widely accessible.
        We offer unlimited media hosting with fully searchable transcripts,
        completely <strong>free of charge</strong>, with{' '}
        <strong>no advertising</strong>.
      </p>

      <p>
        Our code is open-source and has been dedicated to the public domain,
        reflecting our belief that ministry tools should serve people, not
        profit. You can inspect, modify, or build on our codebase, because
        transparency matters. We're sustained by believers who share our vision
        and choose to invest in this work. If you're interested in the biblical
        reasoning behind this approach, learn more about{' '}
        <Link
          to="/about/dorean"
          className="font-semibold text-brand hover:text-brand-700"
        >
          the Dorean Principle
        </Link>
        .
      </p>

      <h3>Join the Mission</h3>
      <p>
        While we provide all services free, we rely on the generous support of
        users and friends of the mission to cover storage, hardware, and legal
        costs. All donations are tax-deductible in the United States and go
        directly toward keeping this platform operating and constantly
        improving.
      </p>

      <p>
        Please note: supporting your local church is first priority. Please do
        not allow any giving to Let's Church interfere with supporting your
        local body.
      </p>

      <div className="not-prose my-8 text-center">
        <a
          href="https://givebutter.com/LetsChurch"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg bg-brand px-8 py-4 font-semibold text-lg text-white shadow-lg transition-colors hover:bg-brand-700"
        >
          Donate Now
        </a>
      </div>

      <p>
        You can also help by spreading the word: share our site, social media
        links, and encourage churches or ministries you know to use the
        platform.
      </p>

      <h3>Looking Ahead</h3>
      <p>
        We're continually striving to advance our platform to serve you better,
        with plans for faster media processing, live-streaming support, mobile
        apps, enhanced tagging and search features, website-builder tools for
        ministries, blogging and community features, note-taking and bookmarking
        functions, and additional content from music and documentaries to
        historic sermons.
      </p>

      <h3>Get in Touch</h3>
      <p>
        We'd love to hear from you. If you have questions, suggestions, or want
        to get involved, please contact us at{' '}
        <a href="mailto:contact@lets.church">contact@lets.church</a>.
      </p>

      <hr />

      <p>
        <strong>Let's Church</strong> is committed to remaining ad-free and
        cost-free for churches, putting technology at the service of the Gospel.
        Join us as we unite around this mission: equipping local churches,
        honoring God, and enabling His Word to go forth unhindered.{' '}
        <strong>Soli Deo Gloria.</strong>
      </p>
    </div>
  );
}
