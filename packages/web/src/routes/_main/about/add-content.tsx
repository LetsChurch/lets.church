import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_main/about/add-content')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="prose prose-lg dark:prose-invert mx-auto max-w-4xl px-4 py-8">
      <h2>How to Add Content</h2>
      <p>
        Share your sermons, teachings, podcasts, and more on Let's Church --
        completely free, with no ads, and fully searchable transcripts.
      </p>

      <h3>Getting Started</h3>
      <ol>
        <li>
          <a href="/auth/register">Create an account</a> and{' '}
          <a href="/auth/login">sign in</a>
        </li>
        <li>
          Click your profile icon and go to <strong>Dashboard</strong>
        </li>
        <li>
          Click <strong>Channels</strong> and create your channel
        </li>
        <li>Start uploading your content</li>
      </ol>

      <p>
        Questions? Email us at{' '}
        <a href="mailto:contact@lets.church">contact@lets.church</a>
      </p>

      <div className="not-prose my-8 text-center">
        <a
          href="/dashboard/channels/new"
          className="inline-block rounded-lg bg-brand px-8 py-4 font-semibold text-lg text-white shadow-lg transition-colors hover:bg-brand-700"
        >
          Create Your Channel
        </a>
      </div>
    </div>
  );
}
