import type { Meta, StoryObj } from '@storybook/react';
import { SearchFacets } from './search-facets';

const CHANNELS = [
  { id: '1', name: 'First Baptist Church', slug: 'first-baptist' },
  { id: '2', name: 'Apologia Studios', slug: 'apologia' },
  { id: '3', name: 'Grace Community Church', slug: 'grace-community' },
  { id: '4', name: 'Cornerstone Baptist Church', slug: 'cornerstone' },
];

const MANY_CHANNELS = Array.from({ length: 16 }, (_, i) => ({
  id: String(i + 1),
  name: `Reformed Channel ${i + 1}`,
  slug: `reformed-${i + 1}`,
}));

// Verse facet rows as the server returns them: OSIS token + label + count,
// most-cited first.
const VERSES = [
  { ref: 'Rom.3.23', label: 'Romans 3:23', count: 14 },
  { ref: 'John.3.16', label: 'John 3:16', count: 11 },
  { ref: 'Eph.2.8', label: 'Ephesians 2:8', count: 9 },
  { ref: 'Gen.1.1', label: 'Genesis 1:1', count: 6 },
  { ref: 'Rom.8.28', label: 'Romans 8:28', count: 4 },
];

const meta = {
  title: 'Components/SearchFacets',
  component: SearchFacets,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    // Matches the 320px-wide search sidebar the facets live in on desktop.
    (Story) => (
      <div className="max-w-[20rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchFacets>;

export default meta;
type Story = StoryObj<typeof meta>;

// The sidebar with channels available to filter by.
export const Default: Story = {
  args: {
    availableChannels: CHANNELS,
  },
};

// While the first page of results loads, the Channels section shows placeholder
// rows (the rest of the facets are static and render immediately).
export const ChannelsLoading: Story = {
  args: {
    availableChannels: [],
    channelsLoading: true,
  },
};

// No channels matched the query: the Channels section is omitted entirely,
// leaving just Sort + Date.
export const NoChannels: Story = {
  args: {
    availableChannels: [],
  },
};

// A long channel list scrolls within the section (max height) rather than
// pushing the Date facet off-screen.
export const ManyChannels: Story = {
  args: {
    availableChannels: MANY_CHANNELS,
  },
};

// AI recommendations marked inline: the recommended channel and the matching
// Date bucket each get a sparkle.
export const WithRecommendations: Story = {
  args: {
    availableChannels: CHANNELS,
    recommendedChannelSlugs: ['apologia'],
    recommendedDate: { kind: 'bucket', bucket: 'this-week' },
  },
};

// A recommended date that isn't a current-period bucket (e.g. "past month") —
// surfaced as an applyable sparkle chip in the custom-range block.
export const WithRecommendedRange: Story = {
  args: {
    availableChannels: CHANNELS,
    recommendedDate: {
      kind: 'range',
      gte: '2024-05-09',
      lte: '2024-06-09',
      label: 'Past month',
    },
  },
};

// The Bible-verse facet: most-cited verses across the result set, each with its
// count, selectable to filter (OR semantics across picks).
export const WithBibleVerses: Story = {
  args: {
    availableChannels: CHANNELS,
    availableVerses: VERSES,
  },
};

// The same facets as rendered inside the mobile drawer (`bordered={false}`) —
// plain sections without the per-card chrome. This is what `MobileFacets`
// places in its bottom sheet.
export const MobileLayout: Story = {
  args: {
    availableChannels: CHANNELS,
    bordered: false,
    recommendedChannelSlugs: ['apologia'],
    recommendedDate: { kind: 'bucket', bucket: 'this-week' },
  },
};
