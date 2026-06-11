import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AnswerSource } from '@/ai/answer-stream';
import type { AppRouter } from '@/trpc';
import { TRPCProvider } from '@/trpc/react';
import { AnswerCard } from './answer-panel';

// The card's source chips / citation badges use MediaPreviewScope, which calls
// useTRPC(). The hover-preview query is `enabled` only while a preview is open,
// so it never fires on initial render — but the provider context must exist.
// This minimal client resolves any procedure to null (good enough for hovers).
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

// A handful of cited sources (Dorean Principle chapters) for the populated
// states. Four of them, so the chip row's "+N" overflow shows when all are
// cited (VISIBLE_SOURCES is 3).
const SOURCES: AnswerSource[] = [
  {
    id: 'src1',
    title: 'Chapter 14 - The Path of Progress',
    channelName: 'The Dorean Principle',
    avatarUrl: 'https://picsum.photos/seed/dorean1/64/64',
    thumbnailUrl: 'https://picsum.photos/seed/dorean1/640/360',
    startSeconds: 312,
  },
  {
    id: 'src2',
    title: 'Chapter 8 - The Apostles of Christ',
    channelName: 'The Dorean Principle',
    avatarUrl: 'https://picsum.photos/seed/dorean2/64/64',
    thumbnailUrl: 'https://picsum.photos/seed/dorean2/640/360',
    startSeconds: 88,
  },
  {
    id: 'src3',
    title: 'Chapter 4 - The Burden of Support',
    channelName: 'The Dorean Principle',
    avatarUrl: 'https://picsum.photos/seed/dorean3/64/64',
    thumbnailUrl: 'https://picsum.photos/seed/dorean3/640/360',
    startSeconds: 540,
  },
  {
    id: 'src4',
    title: 'Chapter 2 - Foundations of Freely Giving',
    channelName: 'The Dorean Principle',
    avatarUrl: 'https://picsum.photos/seed/dorean4/64/64',
    thumbnailUrl: 'https://picsum.photos/seed/dorean4/640/360',
    startSeconds: 12,
  },
];

const ANSWER = `Grace-based giving means supporting gospel ministry freely rather than by obligation or sale. Paul modeled this by refusing payment for the gospel so it would be free of charge [1], while still gladly receiving voluntary support from churches that partnered with him [2].

The principle warns that placing a minister under direct financial obligation can compromise the sincerity of the message [3].`;

const OVERVIEW = `Grace-based giving is treated as supporting ministry through co-labor rather than selling it [1]: Paul and the Jerusalem apostles received voluntary support [2], and the same logic bears on how Christian resources are copyrighted and distributed [3].`;

const LONG_ANSWER = `Grace-based giving is the practice of supporting ministry as a free gift rather than a transaction. It rests on a few connected ideas drawn throughout the sources.

## What it means

The gospel is given "without charge," so those who preach it should not sell it [1]. Support flows from shared labor and gratitude, not from a price tag attached to the message [2].

## How it worked for Paul

- Paul refused payment from those he was actively evangelizing, to remove any hint of profit motive [1].
- He still received voluntary gifts from established churches that partnered with him [2].
- The Jerusalem apostles were supported by the wider body of believers [3].

## Why it matters today

Placing a minister under direct financial obligation can quietly compromise the sincerity of the message [3]. The same logic extends to how Christian books, recordings, and other resources are copyrighted and distributed [4].`;

const DECLINE = "I couldn't find anything about that in the library.";

const meta = {
  title: 'Components/AnswerCard',
  component: AnswerCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          {/* Matches the width of the search results column the card lives in. */}
          <div className="max-w-3xl">
            <Story />
          </div>
        </TRPCProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof AnswerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Waiting on the first token: shimmering "Seeking…".
export const Seeking: Story = {
  args: {
    status: 'streaming',
    answer: '',
    sources: [],
  },
};

// Mid-stream: partial answer with the chips already resolving.
export const StreamingPartial: Story = {
  args: {
    status: 'streaming',
    answer:
      'Grace-based giving means supporting gospel ministry freely rather than by obligation or sale. Paul modeled this by refusing payment for the gospel so it would be free of cha',
    sources: SOURCES,
  },
};

// A completed, grounded answer with inline citations + cited-source chips.
export const Answer: Story = {
  args: {
    status: 'done',
    answer: ANSWER,
    sources: SOURCES,
  },
};

// The overview fallback: on-topic but not a direct answer.
export const Overview: Story = {
  args: {
    status: 'done',
    answer: OVERVIEW,
    sources: SOURCES,
  },
};

// A long answer that overflows the collapsed height, revealing "See more".
// All four sources are cited, so the chip row shows its "+1" overflow.
export const LongAnswer: Story = {
  args: {
    status: 'done',
    answer: LONG_ANSWER,
    sources: SOURCES,
  },
};

// Off-topic / nothing found: a concise decline with no sources.
export const Decline: Story = {
  args: {
    status: 'done',
    answer: DECLINE,
    sources: [],
  },
};

// The fetch failed.
export const ErrorState: Story = {
  name: 'Error',
  args: {
    status: 'error',
    answer: '',
    sources: [],
  },
};

// The media-page ("ask about this video") variant: the question renders as a
// bold heading, and because it's scoped to one video, `onCite` makes the source
// chips show timestamps (and seek the player) instead of avatar/title preview
// chips.
export const VideoAnswer: Story = {
  args: {
    status: 'done',
    heading: 'How does grace-based giving differ from selling ministry?',
    answer: ANSWER,
    sources: SOURCES,
    onCite: () => undefined,
  },
};

// The same media-page variant while still loading: the question heading is
// already shown above the shimmering "Seeking…".
export const VideoSeeking: Story = {
  args: {
    status: 'streaming',
    heading: 'How does grace-based giving differ from selling ministry?',
    answer: '',
    sources: [],
    onCite: () => undefined,
  },
};
