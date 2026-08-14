import type { Meta, StoryObj } from '@storybook/react';
import { Suspense } from 'react';
import { expect, within } from 'storybook/test';

import { StoryTRPCProvider } from '../../.storybook/trpc-fixture';
import Sidebar from './sidebar';

const meta = {
  title: 'Components/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark',
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <StoryTRPCProvider responses={{ 'common.hasValidSession': false }}>
        <Suspense fallback={null}>
          <div className="h-screen">
            <Story />
          </div>
        </Suspense>
      </StoryTRPCProvider>
    ),
  ],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).findByRole('navigation'),
    ).resolves.toBeInTheDocument();
  },
};
