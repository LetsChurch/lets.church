import type { Meta, StoryObj } from '@storybook/react';
import MobileMenu from './mobile-menu';

const meta = {
  title: 'Components/MobileMenu',
  component: MobileMenu,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MobileMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
  },
  render: (args) => {
    return <MobileMenu {...args} />;
  },
};
