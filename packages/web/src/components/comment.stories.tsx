import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

import type { AppRouter } from '@/trpc';
import { TRPCProvider } from '@/trpc/react';

import { Comment } from './comment';

// Create mock query client with pre-filled data
const createMockQueryClient = (isLoggedIn: boolean) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  // Pre-fill the hasValidSession query with the proper query key structure
  queryClient.setQueryData(
    [['common', 'hasValidSession'], { type: 'query' }],
    isLoggedIn,
  );

  return queryClient;
};

// Mock reply data - 12 replies to match the WithReplies story
const mockReplies = [
  {
    id: 'reply-1',
    text: 'I completely agree! This was very helpful.',
    createdAt: new Date('2025-10-17T11:00:00Z'),
    author: {
      id: 'user-2',
      username: 'janedoe',
      fullName: 'Jane Doe',
      avatarPath: null,
    },
    likeCount: 3,
    replyCount: 0,
    userRating: null,
  },
  {
    id: 'reply-2',
    text: 'Thanks for sharing your thoughts on this!',
    createdAt: new Date('2025-10-17T12:30:00Z'),
    author: {
      id: 'user-3',
      username: 'bobsmith',
      fullName: null,
      avatarPath: null,
    },
    likeCount: 1,
    replyCount: 0,
    userRating: 'LIKE' as const,
  },
  {
    id: 'reply-3',
    text: 'Could you elaborate more on this point?',
    createdAt: new Date('2025-10-17T14:00:00Z'),
    author: {
      id: 'user-4',
      username: 'alicejones',
      fullName: 'Alice Jones',
      avatarPath: null,
    },
    likeCount: 0,
    replyCount: 0,
    userRating: null,
  },
  {
    id: 'reply-4',
    text: 'Great point! I had the same question.',
    createdAt: new Date('2025-10-17T15:00:00Z'),
    author: {
      id: 'user-5',
      username: 'mikebrown',
      fullName: 'Mike Brown',
      avatarPath: null,
    },
    likeCount: 2,
    replyCount: 0,
    userRating: null,
  },
  {
    id: 'reply-5',
    text: 'This helped clarify things for me too.',
    createdAt: new Date('2025-10-17T16:00:00Z'),
    author: {
      id: 'user-6',
      username: 'sarahjohnson',
      fullName: null,
      avatarPath: null,
    },
    likeCount: 5,
    replyCount: 0,
    userRating: 'LIKE' as const,
  },
  {
    id: 'reply-6',
    text: 'Interesting perspective!',
    createdAt: new Date('2025-10-17T17:00:00Z'),
    author: {
      id: 'user-7',
      username: 'davidlee',
      fullName: 'David Lee',
      avatarPath: null,
    },
    likeCount: 1,
    replyCount: 0,
    userRating: null,
  },
  {
    id: 'reply-7',
    text: 'Can you provide more examples?',
    createdAt: new Date('2025-10-17T18:00:00Z'),
    author: {
      id: 'user-8',
      username: 'emilywilson',
      fullName: 'Emily Wilson',
      avatarPath: null,
    },
    likeCount: 0,
    replyCount: 0,
    userRating: null,
  },
  {
    id: 'reply-8',
    text: 'This is exactly what I was looking for!',
    createdAt: new Date('2025-10-17T19:00:00Z'),
    author: {
      id: 'user-9',
      username: 'chrismartin',
      fullName: null,
      avatarPath: null,
    },
    likeCount: 4,
    replyCount: 0,
    userRating: null,
  },
  {
    id: 'reply-9',
    text: 'Well explained, thank you!',
    createdAt: new Date('2025-10-17T20:00:00Z'),
    author: {
      id: 'user-10',
      username: 'lisaanderson',
      fullName: 'Lisa Anderson',
      avatarPath: null,
    },
    likeCount: 7,
    replyCount: 0,
    userRating: 'LIKE' as const,
  },
  {
    id: 'reply-10',
    text: 'I have a follow-up question about this.',
    createdAt: new Date('2025-10-17T21:00:00Z'),
    author: {
      id: 'user-11',
      username: 'johnthompson',
      fullName: 'John Thompson',
      avatarPath: null,
    },
    likeCount: 2,
    replyCount: 0,
    userRating: null,
  },
  {
    id: 'reply-11',
    text: 'Thanks for the detailed response!',
    createdAt: new Date('2025-10-17T22:00:00Z'),
    author: {
      id: 'user-12',
      username: 'amywhite',
      fullName: null,
      avatarPath: null,
    },
    likeCount: 3,
    replyCount: 0,
    userRating: null,
  },
  {
    id: 'reply-12',
    text: 'This really helped me understand better.',
    createdAt: new Date('2025-10-17T23:00:00Z'),
    author: {
      id: 'user-13',
      username: 'robertgarcia',
      fullName: 'Robert Garcia',
      avatarPath: null,
    },
    likeCount: 6,
    replyCount: 0,
    userRating: 'LIKE' as const,
  },
];

// Create a mock tRPC client that returns the logged-in state
const createMockTRPCClient = (isLoggedIn: boolean) => {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://localhost:3000/trpc',
        transformer: superjson,
        fetch: async (url: RequestInfo | URL, options?: RequestInit) => {
          // Parse URL to get the batch parameter for GET requests
          type TRPCRequest = {
            path: string;
            json?: unknown;
          };
          let requests: TRPCRequest[] = [];

          // Convert RequestInfo to URL
          const urlString =
            typeof url === 'string'
              ? url
              : url instanceof URL
                ? url.href
                : url.url;
          const urlObj = new URL(urlString);

          if (options?.method === 'GET' || !options?.body) {
            // GET request - parse URL input parameter
            const inputParam = urlObj.searchParams.get('input');

            if (inputParam) {
              try {
                const decoded = decodeURIComponent(inputParam);
                const parsed = JSON.parse(decoded) as Record<
                  string,
                  { json?: TRPCRequest } | TRPCRequest
                >;
                // The parsed object has keys like "0", "1", etc. with the actual requests
                const inputValues = Object.values(parsed);
                if (inputValues.length > 0) {
                  requests = inputValues.map((item) => {
                    // Each item has a "json" property with the actual data
                    if (
                      typeof item === 'object' &&
                      item !== null &&
                      'json' in item
                    ) {
                      return item.json as TRPCRequest;
                    }
                    return item as TRPCRequest;
                  });
                } else {
                  // Single request without batch format
                  requests = [parsed as TRPCRequest];
                }
              } catch (e) {
                console.error('[Mock fetch] Failed to parse input param:', e);
              }
            }
          } else {
            // POST request - parse body
            try {
              const bodyString =
                typeof options.body === 'string'
                  ? options.body
                  : new TextDecoder().decode(options.body as ArrayBuffer);
              const parsed = superjson.parse(bodyString) as
                | TRPCRequest
                | TRPCRequest[];
              requests = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
              console.error('[Mock fetch] Failed to parse body:', e);
            }
          }

          // For GET requests, extract the procedure path from the URL
          let procedurePath = '';
          if (options?.method === 'GET' || !options?.body) {
            // Extract path like "media.getReplies" from "/trpc/media.getReplies"
            const pathMatch = urlObj.pathname.match(/\/trpc\/(.+)$/);
            if (pathMatch) {
              procedurePath = pathMatch[1];
            }
          }

          const responses = requests.map((req) => {
            const path = procedurePath || req.path;

            let rawData: unknown;

            // Handle hasValidSession query
            if (path === 'common.hasValidSession') {
              rawData = isLoggedIn;
            }
            // Handle getReplies query
            else if (path === 'media.getReplies') {
              rawData = mockReplies;
            }
            // Handle rateComment mutation
            else if (path === 'media.rateComment') {
              rawData = {};
            }
            // Handle createComment mutation
            else if (path === 'media.createComment') {
              rawData = {};
            }
            // Default empty response
            else {
              rawData = {};
            }

            // Serialize just the data part with superjson
            const serializedData = superjson.serialize(rawData);

            // Return in the format tRPC expects: {result: {data: {json, meta}}}
            return {
              result: {
                data: serializedData,
              },
            };
          });

          // For single requests, return the first response directly
          // For batch requests, return the array
          const batchParam = urlObj.searchParams.get('batch');
          const isBatch = batchParam && parseInt(batchParam, 10) > 1;

          const finalResponse = isBatch ? responses : responses[0];

          // Return as JSON string (already serialized with superjson)
          const responseBody = JSON.stringify(finalResponse);

          return new Response(responseBody, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      }),
    ],
  });
};

const meta = {
  title: 'Components/Comment',
  component: Comment,
  parameters: {
    layout: 'padded',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#18181b' },
        { name: 'light', value: '#ffffff' },
      ],
    },
    isLoggedIn: true,
  },
  tags: ['autodocs'],
  decorators: [
    (Story, context) => {
      const isLoggedIn = context.parameters.isLoggedIn ?? true;
      const queryClient = createMockQueryClient(isLoggedIn);
      const trpcClient = createMockTRPCClient(isLoggedIn);

      return (
        <QueryClientProvider client={queryClient}>
          <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
            <div className="max-w-2xl">
              <Story />
            </div>
          </TRPCProvider>
        </QueryClientProvider>
      );
    },
  ],
} satisfies Meta<typeof Comment>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockComment = {
  id: '1',
  text: 'This is a great video! Thanks for sharing.',
  createdAt: new Date('2025-10-17T10:30:00Z'),
  author: {
    id: 'user-1',
    username: 'johndoe',
    fullName: 'John Doe',
    avatarPath: null,
  },
  likeCount: 5,
  replyCount: 2,
  userRating: null as 'LIKE' | 'DISLIKE' | null,
};

export const Default: Story = {
  args: {
    comment: mockComment,
    mediaId: 'media-123',
    onLoginRequired: () => alert('Please log in'),
  },
};

export const WithLikedByUser: Story = {
  args: {
    comment: {
      ...mockComment,
      userRating: 'LIKE' as const,
      likeCount: 6,
    },
    mediaId: 'media-123',
    onLoginRequired: () => alert('Please log in'),
  },
};

export const WithDislikedByUser: Story = {
  args: {
    comment: {
      ...mockComment,
      userRating: 'DISLIKE' as const,
    },
    mediaId: 'media-123',
    onLoginRequired: () => alert('Please log in'),
  },
};

export const NoLikes: Story = {
  args: {
    comment: {
      ...mockComment,
      likeCount: 0,
    },
    mediaId: 'media-123',
    onLoginRequired: () => alert('Please log in'),
  },
};

export const WithReplies: Story = {
  args: {
    comment: {
      ...mockComment,
      text: 'This video really helped me understand the topic better. Great explanation!',
      replyCount: 12,
      likeCount: 23,
    },
    mediaId: 'media-123',
    onLoginRequired: () => alert('Please log in'),
  },
};

export const NoReplies: Story = {
  args: {
    comment: {
      ...mockComment,
      replyCount: 0,
    },
    mediaId: 'media-123',
    onLoginRequired: () => alert('Please log in'),
  },
};

export const LoggedOut: Story = {
  args: {
    comment: mockComment,
    mediaId: 'media-123',
    onLoginRequired: () => alert('Please log in to interact'),
  },
  parameters: {
    isLoggedIn: false,
  },
};

export const LongComment: Story = {
  args: {
    comment: {
      ...mockComment,
      text: 'This is a much longer comment that spans multiple lines. It contains a lot of text to demonstrate how the comment component handles longer content. The text should wrap nicely and maintain good readability. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    },
    mediaId: 'media-123',
    onLoginRequired: () => alert('Please log in'),
  },
};

export const WithAvatar: Story = {
  args: {
    comment: {
      ...mockComment,
      author: {
        ...mockComment.author,
        avatarPath: 'avatars/user-1.jpg',
      },
    },
    mediaId: 'media-123',
    onLoginRequired: () => alert('Please log in'),
  },
};

export const HighlyLiked: Story = {
  args: {
    comment: {
      ...mockComment,
      likeCount: 1337,
    },
    mediaId: 'media-123',
    onLoginRequired: () => alert('Please log in'),
  },
};
