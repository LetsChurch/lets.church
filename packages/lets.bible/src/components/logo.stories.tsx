import type { Meta, StoryObj } from '@storybook/react';

import { Logo } from './logo';

const meta = {
  title: 'Brand/Logo',
  component: Logo,
  tags: ['autodocs'],
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

// Full wordmark — lettering on currentColor, the dot keeps the gold accent.
export const Wordmark: Story = {
  args: { className: 'h-10 text-ink-strong' },
};

// The l+B icon (public/logoicon.svg, via <use>), used as the collapsed/app-icon
// form. Single-color, follows currentColor.
export const Icon: Story = {
  args: { collapsed: true, className: 'h-16 text-ink-strong' },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-6">
      <Logo className="text-ink-strong h-4" />
      <Logo className="text-ink-strong h-7" />
      <Logo className="text-ink-strong h-12" />
    </div>
  ),
};
