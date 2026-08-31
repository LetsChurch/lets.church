import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';

import { Button } from './button';
import { Loader, LoadingOverlay } from './feedback';

const meta = {
  title: 'Dashboard/Loading Overlay',
  component: LoadingOverlay,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LoadingOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CoversStackedContent: Story = {
  render: () => (
    <div className="bg-dashboard-canvas relative h-80 overflow-hidden rounded-2xl p-6">
      <LoadingOverlay
        visible
        withLoader={false}
        className="upload-loading-overlay"
      />

      <button
        type="button"
        data-testid="thumbnail-remove"
        className="absolute top-6 right-6 z-10 rounded bg-zinc-700 p-2 text-white"
      >
        ×
      </button>
      <div
        data-testid="inline-loader"
        className="absolute inset-0 flex items-center justify-center"
      >
        <Loader />
      </div>
      <Button
        data-testid="destructive-action"
        color="red"
        variant="light"
        className="absolute right-6 bottom-6"
      >
        Delete Upload
      </Button>
    </div>
  ),
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overlay = canvasElement.querySelector('.upload-loading-overlay');
    expect(overlay).not.toBeNull();
    const coveredElements = [
      canvas.getByTestId('thumbnail-remove'),
      canvas.getByTestId('inline-loader'),
      canvas.getByTestId('destructive-action'),
    ];

    expect(canvas.getAllByRole('status')).toHaveLength(1);

    for (const element of coveredElements) {
      const rect = element.getBoundingClientRect();
      expect(
        document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        ),
      ).toBe(overlay);
    }
  },
};
