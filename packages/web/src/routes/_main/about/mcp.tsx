import { createFileRoute, Link } from '@tanstack/react-router';

const MCP_URL = 'https://lets.church/mcp';
const CLAUDE_DIRECTORY_URL = 'https://claude.ai/directory/letschurch';

export const Route = createFileRoute('/_main/about/mcp')({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "Use Let's Church with AI (MCP) - Let's Church",
      },
      {
        name: 'description',
        content:
          "Connect Claude and other AI assistants to Let's Church with the Model Context Protocol to search sermons, read transcripts, and find churches — with links back to the source.",
      },
    ],
    links: [
      {
        rel: 'canonical',
        href: 'https://lets.church/about/mcp',
      },
    ],
  }),
});

// Human-facing summaries of the tools in `src/mcp/tools.ts`. Keep in sync when
// adding, renaming, or removing a tool there.
const tools: Array<{ name: string; summary: string }> = [
  {
    name: 'search_sermons',
    summary:
      'Search sermons by topic, question, or phrase across titles, summaries, and full transcripts. Filter by speaker, channel, Bible verse or book, and publish date.',
  },
  {
    name: 'find_filter_values',
    summary:
      'Look up the exact speaker names, channels, Bible books and verses, and years that search filters accept.',
  },
  {
    name: 'get_sermon',
    summary:
      'Details for one sermon: description, summary, chapter outline, speakers, cited Scripture, and series.',
  },
  {
    name: 'get_transcript',
    summary:
      'Read a sermon transcript with speaker names and timestamps, a section at a time.',
  },
  {
    name: 'get_related_sermons',
    summary: 'Find sermons similar to one you already have.',
  },
  {
    name: 'get_channel',
    summary:
      'A ministry’s profile: who preaches there, its most-cited verses, linked churches, and latest sermons.',
  },
  {
    name: 'get_series',
    summary: 'A sermon series and its sermons in order.',
  },
  {
    name: 'find_churches',
    summary:
      'Find churches near a location, optionally filtered by denomination, confession, worship style, and more.',
  },
  {
    name: 'list_church_tags',
    summary: 'The tags churches can be filtered by.',
  },
];

function RouteComponent() {
  return (
    <div className="prose prose-lg dark:prose-invert mx-auto max-w-4xl px-4 py-8">
      <h2>Use Let's Church with AI</h2>
      <p>
        Let's Church offers a{' '}
        <a href="https://modelcontextprotocol.io">Model Context Protocol</a>{' '}
        (MCP) server, so AI assistants like Claude can search sermons, read
        transcripts, and find churches on your behalf. Every answer links back
        to the exact moment in the sermon it came from, so you can listen for
        yourself.
      </p>

      <h3>Connect</h3>
      <p>The server address is:</p>
      <pre>
        <code>{MCP_URL}</code>
      </pre>
      <p>
        It uses the Streamable HTTP transport and needs no account or API key.
      </p>

      <h4>Claude</h4>
      <p>
        Let's Church is listed in Claude's connector directory. Open{' '}
        <a href={CLAUDE_DIRECTORY_URL}>Let's Church in the Claude directory</a>{' '}
        and choose <strong>Connect</strong>. There's nothing else to set up.
      </p>
      <p>
        You can also add it by hand: open <strong>Settings</strong> →{' '}
        <strong>Connectors</strong>, choose{' '}
        <strong>Add custom connector</strong>, name it <em>Let's Church</em>,
        and paste the server address above.
      </p>

      <h4>ChatGPT</h4>
      <p>
        Custom connectors need a paid ChatGPT plan (Plus, Pro, Business,
        Enterprise, or Edu). On Business and Enterprise workspaces, an admin may
        need to allow them first.
      </p>
      <ol>
        <li>
          Open <strong>Settings</strong> →{' '}
          <strong>Apps &amp; Connectors</strong>, then{' '}
          <strong>Advanced settings</strong>, and turn on{' '}
          <strong>Developer mode</strong>
        </li>
        <li>
          Back in <strong>Apps &amp; Connectors</strong>, choose{' '}
          <strong>Create</strong>
        </li>
        <li>
          Name it <em>Let's Church</em>, paste the server address above, set{' '}
          <strong>Authentication</strong> to <strong>No authentication</strong>,
          and confirm that you trust the connector
        </li>
        <li>
          In a new chat, open the <strong>+</strong> menu, choose{' '}
          <strong>Developer mode</strong>, and turn on Let's Church
        </li>
      </ol>
      <p>
        ChatGPT moves these settings around from time to time; if a menu isn't
        where we describe, look for <em>Developer mode</em> and{' '}
        <em>Connectors</em> in Settings.
      </p>

      <h4>Claude Code</h4>
      <pre>
        <code>{`claude mcp add --transport http lets-church ${MCP_URL}`}</code>
      </pre>

      <h4>Other MCP clients</h4>
      <p>
        Any client that supports remote MCP servers over Streamable HTTP will
        work. Most accept a configuration like this:
      </p>
      <pre>
        <code>
          {JSON.stringify(
            { mcpServers: { 'lets-church': { type: 'http', url: MCP_URL } } },
            null,
            2,
          )}
        </code>
      </pre>

      <h3>Things to try</h3>
      <ul>
        <li>“What have pastors on Let's Church preached about Romans 8:28?”</li>
        <li>
          “Find sermons on forgiveness from the last year and summarize them.”
        </li>
        <li>“Walk me through the sermons in this series, in order.”</li>
        <li>“Find a Reformed Baptist church near Nashville.”</li>
      </ul>

      <h3>Tools</h3>
      <dl>
        {tools.map((tool) => (
          <div key={tool.name}>
            <dt>
              <code>{tool.name}</code>
            </dt>
            <dd>{tool.summary}</dd>
          </div>
        ))}
      </dl>

      <h3>What it can and can't do</h3>
      <ul>
        <li>
          <strong>Read-only.</strong> The server can't post comments, change
          ratings, or act on your account.
        </li>
        <li>
          <strong>Public content only.</strong> It sees the same sermons and
          churches anyone can see on the site. Private media is never visible,
          and unlisted media never shows up in search.
        </li>
        <li>
          <strong>Anonymous.</strong> It doesn't sign in as you, so your
          library, history, and followed channels aren't available. Searches are
          handled like anonymous searches on the site — see our{' '}
          <Link to="/about/privacy">Privacy Policy</Link>.
        </li>
        <li>
          <strong>Rate limited.</strong> Each connection has a fair-use limit.
          If your assistant reports being rate limited, wait a few seconds and
          try again.
        </li>
      </ul>

      <h3>Attribution</h3>
      <p>
        The sermons belong to the ministries who share them. When your assistant
        quotes a sermon, it's given a link to the exact timestamp — please keep
        those links so others can hear the full context and find the ministry
        behind it.
      </p>

      <p>
        Questions or ideas? Email us at{' '}
        <a href="mailto:contact@lets.church">contact@lets.church</a>
      </p>
    </div>
  );
}
