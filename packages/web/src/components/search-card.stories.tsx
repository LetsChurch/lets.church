import type { Meta, StoryObj } from '@storybook/react';

import { SearchCard } from './search-card';

const meta = {
  title: 'Components/SearchCard',
  component: SearchCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="aspect-video max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SearchCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
