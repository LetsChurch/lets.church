import type { Meta, StoryObj } from '@storybook/react';

import { FeaturedMediaSearchResult } from './-featured-media-search-result';

const meta = {
  title: 'Dashboard/Featured Media Search Result',
  component: FeaturedMediaSearchResult,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="bg-dashboard-surface w-[34rem] max-w-[calc(100vw-2rem)] rounded-lg p-2">
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'The Hope Set Before Us',
    channelName: 'Redeemer Fellowship',
    description:
      'A sermon on the certainty of Christian hope and the promises of God.',
    thumbnailUrl: 'https://picsum.photos/seed/featured-media/448/252',
    lengthSeconds: 2784,
    viewCount: 1842,
    publishedAt: '2026-08-10T00:00:00.000Z',
  },
} satisfies Meta<typeof FeaturedMediaSearchResult>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
