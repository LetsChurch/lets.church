import type { Meta, StoryObj } from '@storybook/react';
import { LbMark, type LbTreatment } from './lb-mark';

// Compare the candidate "lB" icon treatments. The problem: isolated, the l's
// ascender towers over the b. Toggle the theme (toolbar) to check light + dark.
const meta = {
  title: 'Brand/Icon Options',
  component: LbMark,
  tags: ['autodocs'],
} satisfies Meta<typeof LbMark>;

export default meta;
type Story = StoryObj<typeof meta>;

const OPTIONS: { treatment: LbTreatment; title: string; note: string }[] = [
  {
    treatment: 'baseline',
    title: 'A · Baseline (current)',
    note: 'Shared baseline — the l towers over the b.',
  },
  {
    treatment: 'centered',
    title: 'B · Optically centered',
    note: 'Native sizes, centers aligned. Softens the overhang; letterforms stay true to the wordmark.',
  },
  {
    treatment: 'b-up',
    title: 'C · b scaled up to l height',
    note: 'Equal height — bolder, more b-dominant.',
  },
  {
    treatment: 'l-down',
    title: 'D · l scaled down to b height',
    note: 'Equal height — keeps the b at native size, trims the l’s lone ascender.',
  },
];

function OptionRow({
  treatment,
  title,
  note,
}: {
  treatment: LbTreatment;
  title: string;
  note: string;
}) {
  return (
    <div className="flex items-center gap-6 border-line border-b py-6 last:border-b-0">
      <div className="flex w-30 flex-shrink-0 justify-center">
        <LbMark treatment={treatment} className="h-16 text-ink-strong" />
      </div>
      {/* favicon-scale legibility check */}
      <div className="flex items-end gap-4">
        <LbMark treatment={treatment} className="h-8 text-ink-strong" />
        <LbMark treatment={treatment} className="h-6 text-ink-strong" />
        <LbMark treatment={treatment} className="h-4 text-ink-strong" />
      </div>
      <div className="flex-1">
        <div className="font-semibold text-[14px] text-ink-strong">{title}</div>
        <div className="text-[13px] text-muted">{note}</div>
      </div>
    </div>
  );
}

// All four side by side, each shown large + at favicon sizes (32 / 24 / 16px).
export const Compare: Story = {
  render: () => (
    <div className="w-[760px] max-w-full">
      <div className="mb-5">
        <h2 className="font-serif text-[26px] text-ink-strong">
          lB icon — treatment options
        </h2>
        <p className="mt-1 text-[14px] text-muted">
          Large preview, then favicon sizes (32 / 24 / 16px) to check small-size
          legibility.
        </p>
      </div>
      <div>
        {OPTIONS.map((o) => (
          <OptionRow key={o.treatment} {...o} />
        ))}
      </div>
    </div>
  ),
};

export const Baseline: Story = {
  args: { treatment: 'baseline', className: 'h-20 text-ink-strong' },
};
export const Centered: Story = {
  args: { treatment: 'centered', className: 'h-20 text-ink-strong' },
};
export const BScaledUp: Story = {
  args: { treatment: 'b-up', className: 'h-20 text-ink-strong' },
};
export const LScaledDown: Story = {
  args: { treatment: 'l-down', className: 'h-20 text-ink-strong' },
};
