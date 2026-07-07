import type { Meta, StoryObj } from '@storybook/react';

import { Avatar } from './avatar';

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  args: { name: 'OIDC Demo User' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { className: 'size-8' },
};

export const Large: Story = {
  args: { className: 'size-14 text-lg' },
};

export const SingleName: Story = {
  args: { name: 'Mary', className: 'size-14 text-lg' },
};
