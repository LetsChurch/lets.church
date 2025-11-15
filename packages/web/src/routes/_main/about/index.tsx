import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_main/about/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="prose prose-lg dark:prose-invert mx-auto max-w-4xl px-4 py-8">
      <h2>Our Mission</h2>
      <p>
        At Let's Church, our mission is to empower churches and Christian
        ministries worldwide by providing <strong>free</strong>, ad-free
        technology resources—designed to amplify their message and make
        Scripture, sermons, and media widely accessible.
      </p>

      <h3>A Foundation of Service</h3>
      <p>
        We are a 501(c)(3) non-profit organization committed to offering sermon
        and media hosting—including fully searchable transcripts—completely{' '}
        <strong>free of charge</strong>, with <strong>no advertising</strong>.
        Our code is open-source and has been dedicated to the public domain,
        reflecting our belief that ministry tools should serve people, not
        profit.
      </p>

      <h3>Why We Do This</h3>
      <p>
        Our belief is that when churches and ministries are not burdened by cost
        or commercial constraints, they are better positioned to focus on what
        really matters: sharing the truth of Christ and building up the body of
        believers. Technology should extend the reach of the Gospel, not
        restrict it.
      </p>

      <h3>What We Offer</h3>
      <ul>
        <li>
          Unlimited media hosting and transcript search for sermons and media.
        </li>
        <li>
          No ads, no fees, and no hidden costs—just tools to help your ministry
          and your listeners.
        </li>
        <li>
          A codebase you can inspect, modify, or build on—because transparency
          matters.
        </li>
      </ul>

      <h3>How You Can Join the Mission</h3>
      <p>
        While we provide all services free, we rely on the generous support of
        users and friends of the mission to cover hosting, storage,
        transcription, and hardware costs. All donations are tax-deductible in
        the United States and go directly toward keeping this platform operating
        and constantly improving. Please note: supporting your local church is
        first priority; when possible, consider how you might give toward Let's
        Church without reducing your giving to your local body.
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
        We're continually striving to advance our platform to serve you better:
      </p>
      <ul>
        <li>Faster media processing and transcripts with advanced hardware.</li>
        <li>Word-level timestamps for deeper search and study capabilities.</li>
        <li>
          Live-streaming support, mobile app, enhanced tagging and search
          features.
        </li>
        <li>
          A church-locator map, website-builder tools for ministries, blogging
          and community features, note‐taking/bookmarking functions, and
          additional content from music, documentaries to historic sermons.
        </li>
      </ul>

      <h3>Reach Out</h3>
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
