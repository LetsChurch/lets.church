import type { Meta, StoryObj } from '@storybook/react';
import { IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { MobileDrawer } from './mobile-drawer';

const meta = {
  title: 'Components/MobileDrawer',
  component: MobileDrawer.Root,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MobileDrawer.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

function MobileDrawerExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 p-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-brand text-primary rounded-lg px-6 py-3 font-medium hover:bg-indigo-600"
      >
        Open Drawer
      </button>

      <MobileDrawer.Root open={open} onOpenChange={setOpen}>
        <MobileDrawer.Portal>
          <MobileDrawer.Backdrop />
          <MobileDrawer.Content>
            {/* Header */}
            <div className="flex h-12 items-center justify-between border-b border-zinc-800 px-5">
              <MobileDrawer.Title className="text-primary text-lg font-bold">
                Drawer Title
              </MobileDrawer.Title>
              <MobileDrawer.Close className="flex size-8 items-center justify-center rounded-lg hover:bg-white/10">
                <IconX size={20} className="text-primary/80" />
              </MobileDrawer.Close>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-primary mb-4">
                This is a mobile drawer component that slides up from the
                bottom.
              </p>
              <p className="text-primary/70 mb-4">
                You can drag the handle at the top to dismiss it, or click
                outside to close.
              </p>
              <div className="space-y-4">
                {Array.from({ length: 20 }, (_, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-primary">Item {i + 1}</p>
                    <p className="text-primary/60 text-sm">
                      This is some content in the drawer
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </MobileDrawer.Content>
        </MobileDrawer.Portal>
      </MobileDrawer.Root>
    </div>
  );
}

export const Default: Story = {
  args: {
    open: false,
    onOpenChange: () => {},
    children: null,
  },
  render: () => <MobileDrawerExample />,
};

function ShortContentExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 p-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-brand text-primary rounded-lg px-6 py-3 font-medium hover:bg-indigo-600"
      >
        Open Short Drawer
      </button>

      <MobileDrawer.Root open={open} onOpenChange={setOpen}>
        <MobileDrawer.Portal>
          <MobileDrawer.Backdrop />
          <MobileDrawer.Content>
            {/* Header */}
            <div className="flex h-12 items-center justify-between border-b border-zinc-800 px-5">
              <MobileDrawer.Title className="text-primary text-lg font-bold">
                Quick Action
              </MobileDrawer.Title>
              <MobileDrawer.Close className="flex size-8 items-center justify-center rounded-lg hover:bg-white/10">
                <IconX size={20} className="text-primary/80" />
              </MobileDrawer.Close>
            </div>

            {/* Content */}
            <div className="p-5">
              <p className="text-primary mb-4">
                This drawer has shorter content.
              </p>
              <button
                type="button"
                className="bg-brand text-primary w-full rounded-lg px-4 py-2 font-medium hover:bg-indigo-600"
              >
                Confirm Action
              </button>
            </div>
          </MobileDrawer.Content>
        </MobileDrawer.Portal>
      </MobileDrawer.Root>
    </div>
  );
}

export const ShortContent: Story = {
  args: {
    open: false,
    onOpenChange: () => {},
    children: null,
  },
  render: () => <ShortContentExample />,
};
