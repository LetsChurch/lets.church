import type { Meta, StoryObj } from '@storybook/react';

import { AvatarCarousel } from './avatar-carousel';

const meta = {
  title: 'Components/AvatarCarousel',
  component: AvatarCarousel,
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
} satisfies Meta<typeof AvatarCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      {
        id: '1',
        name: 'First Baptist Church',
        slug: 'first-baptist-church',
        avatarUrl: 'https://picsum.photos/seed/fbc/100/100',
      },
      {
        id: '2',
        name: 'Community Church',
        slug: 'community-church',
        avatarUrl: 'https://picsum.photos/seed/cc/100/100',
      },
      {
        id: '3',
        name: 'Grace Chapel',
        slug: 'grace-chapel',
        avatarUrl: 'https://picsum.photos/seed/gc/100/100',
      },
      {
        id: '4',
        name: 'City Church',
        slug: 'city-church',
        avatarUrl: 'https://picsum.photos/seed/citych/100/100',
      },
      {
        id: '5',
        name: 'Hope Church',
        slug: 'hope-church',
        avatarUrl: 'https://picsum.photos/seed/hope/100/100',
      },
      {
        id: '6',
        name: 'Lighthouse Church',
        slug: 'lighthouse-church',
        avatarUrl: 'https://picsum.photos/seed/lighthouse/100/100',
      },
      {
        id: '7',
        name: 'New Life Church',
        slug: 'new-life-church',
        avatarUrl: 'https://picsum.photos/seed/newlife/100/100',
      },
      {
        id: '8',
        name: 'Cornerstone Church',
        slug: 'cornerstone-church',
        avatarUrl: 'https://picsum.photos/seed/cornerstone/100/100',
      },
    ],
  },
};

export const WithoutAvatars: Story = {
  args: {
    items: [
      {
        id: '1',
        name: 'First Baptist Church',
        slug: 'first-baptist-church',
      },
      {
        id: '2',
        name: 'Community Church',
        slug: 'community-church',
      },
      {
        id: '3',
        name: 'Grace Chapel',
        slug: 'grace-chapel',
      },
      {
        id: '4',
        name: 'City Church',
        slug: 'city-church',
      },
      {
        id: '5',
        name: 'Hope Church',
        slug: 'hope-church',
      },
      {
        id: '6',
        name: 'Lighthouse Church',
        slug: 'lighthouse-church',
      },
    ],
  },
};

export const LongNames: Story = {
  args: {
    items: [
      {
        id: '1',
        name: 'First Baptist Church of the Greater Metropolitan Area',
        slug: 'first-baptist-church',
        avatarUrl: 'https://picsum.photos/seed/fbc/100/100',
      },
      {
        id: '2',
        name: 'Community Reformed Presbyterian Church',
        slug: 'community-reformed',
        avatarUrl: 'https://picsum.photos/seed/cc/100/100',
      },
      {
        id: '3',
        name: 'Grace Chapel International Ministries',
        slug: 'grace-chapel',
        avatarUrl: 'https://picsum.photos/seed/gc/100/100',
      },
      {
        id: '4',
        name: 'New Covenant Fellowship Church',
        slug: 'new-covenant',
        avatarUrl: 'https://picsum.photos/seed/citych/100/100',
      },
    ],
  },
};

export const MixedAvatars: Story = {
  args: {
    items: [
      {
        id: '1',
        name: 'First Baptist Church',
        slug: 'first-baptist-church',
        avatarUrl: 'https://picsum.photos/seed/fbc/100/100',
      },
      {
        id: '2',
        name: 'Community Church',
        slug: 'community-church',
      },
      {
        id: '3',
        name: 'Grace Chapel',
        slug: 'grace-chapel',
        avatarUrl: 'https://picsum.photos/seed/gc/100/100',
      },
      {
        id: '4',
        name: 'City Church',
        slug: 'city-church',
      },
      {
        id: '5',
        name: 'Hope Church',
        slug: 'hope-church',
        avatarUrl: 'https://picsum.photos/seed/hope/100/100',
      },
      {
        id: '6',
        name: 'Lighthouse Church',
        slug: 'lighthouse-church',
      },
    ],
  },
};

export const Few: Story = {
  args: {
    items: [
      {
        id: '1',
        name: 'First Baptist Church',
        slug: 'first-baptist-church',
        avatarUrl: 'https://picsum.photos/seed/fbc/100/100',
      },
      {
        id: '2',
        name: 'Community Church',
        slug: 'community-church',
        avatarUrl: 'https://picsum.photos/seed/cc/100/100',
      },
      {
        id: '3',
        name: 'Grace Chapel',
        slug: 'grace-chapel',
        avatarUrl: 'https://picsum.photos/seed/gc/100/100',
      },
    ],
  },
};

export const Many: Story = {
  args: {
    items: Array.from({ length: 20 }, (_, i) => ({
      id: `${i + 1}`,
      name: `Church ${i + 1}`,
      slug: `church-${i + 1}`,
      avatarUrl: `https://picsum.photos/seed/church${i + 1}/100/100`,
    })),
  },
};
