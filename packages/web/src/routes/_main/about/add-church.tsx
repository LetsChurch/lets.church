import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_main/about/add-church')({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "Add Your Church - Let's Church",
      },
      {
        name: 'description',
        content:
          "Add your church to Let's Church directory so people can find your church and watch your content. Free media hosting for churches.",
      },
    ],
    links: [
      {
        rel: 'canonical',
        href: 'https://lets.church/about/add-church',
      },
    ],
  }),
});

function RouteComponent() {
  return (
    <div className="prose prose-lg dark:prose-invert mx-auto max-w-4xl px-4 py-8">
      <h2>How to Add Your Church</h2>
      <p>
        Add your church to our directory so people can find your church and
        watch your content.
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
        <li>Navigate to the churches section and add your church</li>
        <li>
          Fill in your church information including name, location, and details
        </li>
      </ol>

      <h3>What Information to Include</h3>
      <ul>
        <li>Official church name</li>
        <li>Physical address and location</li>
        <li>Service times and contact information</li>
        <li>A brief description of your church and mission</li>
      </ul>

      <p>
        Questions? Email us at{' '}
        <a href="mailto:contact@lets.church">contact@lets.church</a>
      </p>

      <div className="not-prose my-8 text-center">
        <a
          href="/dashboard"
          className="inline-block rounded-lg bg-brand px-8 py-4 font-semibold text-lg text-white shadow-lg transition-colors hover:bg-brand-700"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
