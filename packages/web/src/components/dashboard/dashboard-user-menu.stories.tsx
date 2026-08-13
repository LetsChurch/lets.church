import type { Meta, StoryObj } from '@storybook/react';

import { DashboardUserMenu } from './dashboard-user-menu';

const meta = {
  title: 'Dashboard/User Menu',
  component: DashboardUserMenu,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="bg-dashboard-surface border-dashboard-rule flex h-16 w-72 items-center justify-end border px-5">
        <Story />
      </div>
    ),
  ],
  args: {
    profile: {
      fullName: 'Jordan Shepherd',
      username: 'jshepherd',
      avatarUrl: null,
    },
    isAdmin: true,
  },
} satisfies Meta<typeof DashboardUserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
