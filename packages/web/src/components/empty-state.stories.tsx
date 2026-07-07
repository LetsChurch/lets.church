import type { Meta, StoryObj } from '@storybook/react';

import { EmptyState } from './empty-state';

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    emptyTitle: { control: 'text' },
    emptyBody: { control: 'text' },
    emptyCta: { control: 'text' },
    emptyCtaHref: { control: 'text' },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    emptyTitle: 'No content found',
    emptyBody: "We couldn't find any content matching your search.",
    emptyCta: 'Browse all content',
    emptyCtaHref: '/',
  },
};

export const WithoutCta: Story = {
  args: {
    emptyTitle: 'No content found',
    emptyBody: "We couldn't find any content matching your search.",
  },
};

export const NoFollowing: Story = {
  args: {
    emptyTitle: 'No channels followed yet',
    emptyBody: 'Start following channels to see their latest content here.',
    emptyCta: 'Explore channels',
    emptyCtaHref: '/search',
  },
};

export const NoUploads: Story = {
  args: {
    emptyTitle: 'No uploads yet',
    emptyBody: 'Upload your first video to get started.',
    emptyCta: 'Upload video',
    emptyCtaHref: '/dashboard/upload',
  },
};

export const Minimal: Story = {
  args: {},
};
