import type { Meta, StoryObj } from '@storybook/react';
import HeroCarousel from './hero-carousel';

const meta = {
  title: 'Components/HeroCarousel',
  component: HeroCarousel,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeroCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      {
        title: 'The Gospel According to Mark',
        author: 'John MacArthur',
        imageUrl: 'https://picsum.photos/seed/1/640/360',
        avatarUrl: 'https://picsum.photos/seed/avatar1/40/40',
        badge: 'Featured',
      },
      {
        title: 'Understanding Romans',
        author: 'R.C. Sproul',
        imageUrl: 'https://picsum.photos/seed/2/640/360',
        avatarUrl: 'https://picsum.photos/seed/avatar2/40/40',
        badge: 'Featured',
      },
      {
        title: 'The Book of Revelation',
        author: 'David Platt',
        imageUrl: 'https://picsum.photos/seed/3/640/360',
        avatarUrl: 'https://picsum.photos/seed/avatar3/40/40',
        badge: 'Featured',
      },
    ],
  },
};
