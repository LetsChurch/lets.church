import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { expect, userEvent, within } from 'storybook/test';
import superjson from 'superjson';

import {
  type AnswerSource,
  channelChunk,
  SOURCES_DELIMITER,
  terminalChunk,
} from '@/ai/answer-stream';
import type { DigDeeperTurnRequest } from '@/ai/dig-deeper-client';
import type { AppRouter } from '@/trpc';
import { TRPCProvider } from '@/trpc/react';

import { DigDeeperChat } from './dig-deeper';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      transformer: superjson,
      fetch: async () =>
        new Response(
          JSON.stringify([{ result: { data: superjson.serialize(null) } }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    }),
  ],
});

const source = (
  id: string,
  title: string,
  startSeconds: number,
): AnswerSource => ({
  id,
  title,
  channelName: 'Regression Channel',
  avatarUrl: null,
  thumbnailUrl: null,
  startSeconds,
});

const overviewSources = [
  source('AbC123', 'Seeded source', 12),
  source('AbC123', 'Seeded source', 98),
  source('GhI789', 'Third source', 30),
  source('JkL012', 'Fourth source', 45),
  source('MnO345', 'Fifth source', 60),
];
const overviewRaw =
  `${JSON.stringify(overviewSources)}${SOURCES_DELIMITER}` +
  'Clementine appears in two distinct moments in this source [1] [2].';

const requestTurn: DigDeeperTurnRequest = async ({ messages, onText }) => {
  const question = messages.at(-1)?.content ?? '';
  const isFollowUp = question === 'Who is she?';
  if (!isFollowUp) {
    throw new Error('The handed-off AI Overview must not be requested again.');
  }
  const historyPresent = messages.some(
    (message) =>
      message.role === 'assistant' &&
      message.content.includes('Clementine') &&
      message.content.includes('[upload:AbC123@12]') &&
      message.content.includes('[upload:AbC123@98]'),
  );
  const sources = [source('DeF456', 'Follow-up source', 44)];
  const answer = historyPresent
    ? 'History carried forward: she is Clementine. [upload:DeF456@44]'
    : 'History was missing.';
  const raw =
    `[]${SOURCES_DELIMITER}` +
    channelChunk('r', `Searching the library for “${question}”…\n`) +
    channelChunk('s', JSON.stringify(sources)) +
    channelChunk('a', answer) +
    terminalChunk({ status: 'done' });
  onText(raw);
  return { status: 'done' };
};

const meta = {
  title: 'Routes/DigDeeper',
  component: DigDeeperChat,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          {/* Mirrors /_main: this element, not window, owns vertical scroll. */}
          <main
            data-testid="story-scroll-root"
            className="relative h-[32rem] overflow-y-auto px-4 py-4"
          >
            <div className="mx-auto max-w-7xl">
              <Story />
            </div>
          </main>
        </TRPCProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof DigDeeperChat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SeededFollowUpAndSourceRail: Story = {
  args: {
    initialQ: 'Tell me about Clementine',
    initialTurn: {
      question: 'Tell me about Clementine',
      raw: overviewRaw,
    },
    requestTurn,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByText(/Clementine appears in two distinct moments/),
    ).resolves.toBeInTheDocument();
    expect(canvas.getAllByText('Tell me about Clementine')).toHaveLength(1);

    // The same upload cited at two moments remains two navigable receipts in
    // this turn's own source section.
    const overviewTurn = canvas.getByTestId('dig-deeper-turn-overview');
    const overviewSourceSection = canvas.getByTestId(
      'dig-deeper-sources-overview',
    );
    expect(overviewTurn).toContainElement(overviewSourceSection);
    expect(getComputedStyle(overviewSourceSection).position).toBe('sticky');
    const overviewSources = within(overviewSourceSection);
    expect(overviewSources.getByText('0:12')).toBeInTheDocument();
    expect(overviewSources.getByText('1:38')).toBeInTheDocument();
    expect(
      within(
        overviewSources.getByTestId('dig-deeper-visible-sources'),
      ).getAllByText(/source/i),
    ).toHaveLength(3);
    expect(overviewSources.queryByTestId('dig-deeper-source-panel')).toBeNull();
    expect(
      getComputedStyle(overviewSources.getByTestId('dig-deeper-source-fade'))
        .maskImage,
    ).not.toBe('none');

    const sourceToggle = overviewSources.getByRole('button', {
      name: 'Show 2 more sources',
    });
    expect(sourceToggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(sourceToggle);
    expect(sourceToggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(overviewSources.getByTestId('dig-deeper-source-panel')).getByText(
        'Fifth source',
      ),
    ).toBeInTheDocument();

    const scrollRoot = canvas.getByTestId('story-scroll-root');
    const composer = canvas.getByTestId('dig-deeper-composer');
    expect(getComputedStyle(composer).position).toBe('sticky');
    const bottomGap =
      scrollRoot.getBoundingClientRect().bottom -
      composer.getBoundingClientRect().bottom;
    expect(bottomGap).toBeGreaterThanOrEqual(0);
    expect(bottomGap).toBeLessThanOrEqual(20);

    await userEvent.type(canvas.getByRole('textbox'), 'Who is she?');
    await userEvent.click(canvas.getByRole('button', { name: 'Send' }));
    await expect(
      canvas.findByText(/History carried forward: she is Clementine/),
    ).resolves.toBeInTheDocument();

    // Both source sections remain rendered and attached to their own turns.
    expect(canvas.getAllByTestId(/^dig-deeper-sources-/)).toHaveLength(2);
    expect(overviewSources.getAllByText('Seeded source')).toHaveLength(2);
    expect(canvas.getByText('Follow-up source')).toBeInTheDocument();
  },
};
