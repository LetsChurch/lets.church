import type { Meta, StoryObj } from '@storybook/react';
import Logo from './logo';

const meta = {
  title: 'Components/Logo',
  component: Logo,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Collapsed: Story = {
  args: {
    collapsed: true,
  },
};
