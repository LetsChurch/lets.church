import type { Meta, StoryObj } from '@storybook/react';
import {
  IconArrowRight,
  IconDots,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';

import { ActionIcon, Button } from './button';

const meta = {
  title: 'Dashboard/Actions',
  component: Button,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="bg-dashboard-canvas rounded-2xl p-6">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hierarchy: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button leftSection={<IconPlus size={16} />}>Primary action</Button>
      <Button variant="outline">Secondary action</Button>
      <Button variant="subtle" rightSection={<IconArrowRight size={16} />}>
        Tertiary action
      </Button>
      <Button color="red" variant="light" leftSection={<IconTrash size={16} />}>
        Destructive action
      </Button>
      <ActionIcon aria-label="More actions" variant="default">
        <IconDots size={17} />
      </ActionIcon>
    </div>
  ),
};

export const SizesAndStates: Story = {
  render: () => (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
          <Button key={size} size={size}>
            {size.toUpperCase()}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button loading>Saving</Button>
        <Button disabled>Unavailable</Button>
        <Button variant="outline">Keyboard focus uses the brand ring</Button>
      </div>
    </div>
  ),
};
