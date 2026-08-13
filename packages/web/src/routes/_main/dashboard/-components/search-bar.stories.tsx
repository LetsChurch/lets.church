import type { Meta, StoryObj } from '@storybook/react';

import { DashboardSearchBar } from './search-bar';

const meta = {
  title: 'Dashboard/Navigation Search',
  component: DashboardSearchBar,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="w-[32rem] max-w-[calc(100vw-2rem)]">
        <Story />
      </div>
    ),
  ],
  args: {
    currentUser: { role: 'ADMIN' },
  },
} satisfies Meta<typeof DashboardSearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AdminPages: Story = {};
