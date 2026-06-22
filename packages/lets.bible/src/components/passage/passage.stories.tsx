import type { Meta, StoryObj } from '@storybook/react';
import { Passage } from './passage';
import { CONTEXT, MODES, philippians4 } from './sample';

const meta = {
  title: 'Reading/Passage',
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// The seven typographic genres the verse renderer supports.
export const VerseRenderingModes: Story = {
  render: () => (
    <div className="w-[1100px] max-w-full">
      <div className="mb-5">
        <h2 className="font-serif text-[26px] text-ink-strong">
          Verse rendering modes
        </h2>
        <p className="mt-1 text-[14px] text-muted">
          How the type system shifts by genre — one renderer, driven by the
          passage markup.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {MODES.map((m) => (
          <div
            key={m.id}
            className="rounded-[14px] border border-line bg-paper-raised p-5"
          >
            <div className="mb-3 flex items-baseline justify-between gap-2.5">
              <span
                className={`font-mono text-[10.5px] uppercase tracking-[0.05em] ${
                  m.id === 'red-letter' ? 'text-redletter' : 'text-gold'
                }`}
              >
                {m.label}
              </span>
              <span className="font-bold font-serif text-[13px] text-muted">
                {m.ref}
              </span>
            </div>
            <Passage blocks={m.blocks} size="base" />
            <div className="mt-3 text-[12px] text-faint leading-snug">
              {m.note}
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
};

// The same passages with the faded-context treatment: surrounding verses recede,
// the matched line keeps full contrast with a gold edge.
export const ContextVariants: Story = {
  render: () => (
    <div className="w-[720px] max-w-full">
      <div className="mb-3">
        <h2 className="font-serif text-[26px] text-ink-strong">
          Context variants
        </h2>
        <p className="mt-1 text-[14px] text-muted">
          The faded-context treatment applied to each genre.
        </p>
      </div>
      {CONTEXT.map((c) => (
        <div
          key={c.id}
          className="border-line py-6 [&:not(:first-child)]:border-t"
        >
          <div className="mb-[14px] font-bold font-serif text-[19px] text-ink-strong">
            {c.ref}
          </div>
          <Passage blocks={c.blocks} />
        </div>
      ))}
      <div className="border-line border-t pt-4 text-[12.5px] text-faint">
        Matched line stays full-contrast; surrounding verses recede — the same
        signature treatment, whatever the genre.
      </div>
    </div>
  ),
};

// The reading-view passage (non-interactive here; selection lives on /bible).
export const ReadingView: Story = {
  render: () => (
    <div className="w-[660px] max-w-full">
      <div className="mb-[34px] text-center">
        <div className="font-bold text-[12px] text-gold-soft uppercase tracking-[0.16em]">
          Philippians
        </div>
        <div className="mt-1.5 font-serif text-[46px] text-ink-strong leading-none">
          Chapter 4
        </div>
      </div>
      <Passage blocks={philippians4} />
    </div>
  ),
};
