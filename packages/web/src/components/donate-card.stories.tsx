import type { Meta, StoryObj } from '@storybook/react';

import { DonateCard } from './donate-card';

const meta = {
  title: 'Components/DonateCard',
  component: DonateCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DonateCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <div className="aspect-video max-w-sm">
        <Story />
      </div>
    ),
  ],
};
