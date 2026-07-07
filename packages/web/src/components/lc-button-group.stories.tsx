import type { Meta, StoryObj } from '@storybook/react';

import LcButtonGroup from './lc-button-group';

const meta = {
  title: 'Components/LcButtonGroup',
  component: LcButtonGroup,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    buttons: { control: 'object' },
  },
} satisfies Meta<typeof LcButtonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    buttons: [{ children: 'like' }, { children: 'dislike' }],
  },
};
