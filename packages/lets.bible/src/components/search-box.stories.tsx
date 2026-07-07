import type { Meta, StoryObj } from '@storybook/react';

import { SearchBox } from './search-box';

const suggestions = [
  { icon: '↵', label: 'John 3:16', meta: 'reference' },
  { icon: '↵', label: 'Philippians 4', meta: 'chapter' },
  { icon: '“”', label: 'do not be anxious', meta: 'exact phrase · 6 verses' },
  { icon: '#', label: 'Anxiety & worry', meta: 'topic' },
  { icon: '↺', label: 'Psalm 23', meta: 'recent' },
];

const chips = [
  'the steadfast love of the Lord',
  'John 3:16',
  'fruit of the Spirit',
  'do not be anxious',
];

const meta = {
  title: 'Components/SearchBox',
  component: SearchBox,
  tags: ['autodocs'],
  args: { suggestions, chips },
  decorators: [
    (Story) => (
      <div className="w-[620px] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchBox>;

export default meta;
type Story = StoryObj<typeof meta>;

// Built on Base UI's Autocomplete — focus the input to open the suggestion list.
export const Large: Story = {
  args: { size: 'lg' },
};

export const Medium: Story = {
  args: { size: 'md' },
};
