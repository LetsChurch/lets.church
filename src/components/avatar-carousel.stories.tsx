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
        avatarUrl: 'https://picsum.photos/seed/fbc/100/100',
      },
      {
        id: '2',
        name: 'Community Church',
        avatarUrl: 'https://picsum.photos/seed/cc/100/100',
      },
      {
        id: '3',
        name: 'Grace Chapel',
        avatarUrl: 'https://picsum.photos/seed/gc/100/100',
      },
      {
        id: '4',
        name: 'City Church',
        avatarUrl: 'https://picsum.photos/seed/citych/100/100',
      },
      {
        id: '5',
        name: 'Hope Church',
        avatarUrl: 'https://picsum.photos/seed/hope/100/100',
      },
      {
        id: '6',
        name: 'Lighthouse Church',
        avatarUrl: 'https://picsum.photos/seed/lighthouse/100/100',
      },
      {
        id: '7',
        name: 'New Life Church',
        avatarUrl: 'https://picsum.photos/seed/newlife/100/100',
      },
      {
        id: '8',
        name: 'Cornerstone Church',
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
      },
      {
        id: '2',
        name: 'Community Church',
      },
      {
        id: '3',
        name: 'Grace Chapel',
      },
      {
        id: '4',
        name: 'City Church',
      },
      {
        id: '5',
        name: 'Hope Church',
      },
      {
        id: '6',
        name: 'Lighthouse Church',
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
        avatarUrl: 'https://picsum.photos/seed/fbc/100/100',
      },
      {
        id: '2',
        name: 'Community Reformed Presbyterian Church',
        avatarUrl: 'https://picsum.photos/seed/cc/100/100',
      },
      {
        id: '3',
        name: 'Grace Chapel International Ministries',
        avatarUrl: 'https://picsum.photos/seed/gc/100/100',
      },
      {
        id: '4',
        name: 'New Covenant Fellowship Church',
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
        avatarUrl: 'https://picsum.photos/seed/fbc/100/100',
      },
      {
        id: '2',
        name: 'Community Church',
      },
      {
        id: '3',
        name: 'Grace Chapel',
        avatarUrl: 'https://picsum.photos/seed/gc/100/100',
      },
      {
        id: '4',
        name: 'City Church',
      },
      {
        id: '5',
        name: 'Hope Church',
        avatarUrl: 'https://picsum.photos/seed/hope/100/100',
      },
      {
        id: '6',
        name: 'Lighthouse Church',
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
        avatarUrl: 'https://picsum.photos/seed/fbc/100/100',
      },
      {
        id: '2',
        name: 'Community Church',
        avatarUrl: 'https://picsum.photos/seed/cc/100/100',
      },
      {
        id: '3',
        name: 'Grace Chapel',
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
      avatarUrl: `https://picsum.photos/seed/church${i + 1}/100/100`,
    })),
  },
};
