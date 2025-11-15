import type { Meta, StoryObj } from '@storybook/react';
import LcButton from './lc-button';

const meta = {
  title: 'Components/LcButton',
  component: LcButton,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    children: { control: 'text' },
  },
} satisfies Meta<typeof LcButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Hello, World!',
  },
};
