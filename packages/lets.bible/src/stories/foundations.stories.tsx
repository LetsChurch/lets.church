import type { Meta, StoryObj } from '@storybook/react';

import { Logo } from '@/components/logo';

// Design-language showcase for lets.bible, drawn from the Claude Design concept:
// a calm, scripture-first system — warm paper surfaces, a single gold accent,
// the Begum Bold wordmark (shipped as logo artwork), Georgia for scripture, and
// Hanken Grotesk for UI. Use the theme toolbar (top) to preview light vs dark.
const meta = {
  title: 'Design/Foundations',
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const SWATCHES: { name: string; cls: string; role: string; light: string }[] = [
  { name: 'paper', cls: 'bg-paper', role: 'Base background', light: '#f4f1e9' },
  {
    name: 'paper-raised',
    cls: 'bg-paper-raised',
    role: 'Cards, inputs',
    light: '#fffdf8',
  },
  {
    name: 'paper-soft',
    cls: 'bg-paper-soft',
    role: 'Subtle panels',
    light: '#fbf9f4',
  },
  { name: 'ink', cls: 'bg-ink', role: 'Body text', light: '#2b2a26' },
  {
    name: 'ink-strong',
    cls: 'bg-ink-strong',
    role: 'Headings, wordmark',
    light: '#26251f',
  },
  { name: 'muted', cls: 'bg-muted', role: 'Secondary text', light: '#6b665b' },
  {
    name: 'muted-2',
    cls: 'bg-muted-2',
    role: 'Tertiary text',
    light: '#8a857a',
  },
  { name: 'faint', cls: 'bg-faint', role: 'Faint labels', light: '#a59f91' },
  { name: 'gold', cls: 'bg-gold', role: 'Accent · the dot', light: '#9a7b3f' },
  {
    name: 'gold-soft',
    cls: 'bg-gold-soft',
    role: 'Accent (soft)',
    light: '#b39a5e',
  },
  {
    name: 'slate',
    cls: 'bg-slate',
    role: 'Secondary accent',
    light: '#5a6b7d',
  },
  { name: 'line', cls: 'bg-line', role: 'Borders', light: '#e7e0d0' },
  {
    name: 'line-strong',
    cls: 'bg-line-strong',
    role: 'Strong borders',
    light: '#ddd6c6',
  },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-ink-strong mb-1 font-serif text-[26px]">{children}</h2>
  );
}

export const Colors: Story = {
  render: () => (
    <div className="w-full max-w-[900px]">
      <SectionTitle>Color</SectionTitle>
      <p className="text-muted mb-6 text-[14px]">
        Warm neutrals with a single gold accent and a sage-slate secondary. Hex
        values are light mode — toggle the theme to preview dark.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SWATCHES.map((s) => (
          <div
            key={s.name}
            className="border-line bg-paper-raised overflow-hidden rounded-xl border"
          >
            <div className={`h-16 w-full ${s.cls}`} />
            <div className="px-3 py-2">
              <div className="text-ink font-mono text-[12px]">{s.name}</div>
              <div className="text-muted-2 text-[12px]">{s.role}</div>
              <div className="text-faint font-mono text-[11px]">{s.light}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div className="w-full max-w-[680px]">
      <SectionTitle>Typography</SectionTitle>
      <p className="text-muted mb-8 text-[14px]">
        The wordmark is set in Begum Bold (shipped as outlined logo artwork);
        Georgia carries scripture; Hanken Grotesk carries the interface.
      </p>

      <div className="space-y-8">
        <div>
          <div className="text-gold-soft mb-2 text-[11px] font-bold tracking-[0.12em] uppercase">
            Wordmark · Begum Bold
          </div>
          <Logo className="text-ink-strong h-9" />
        </div>

        <div>
          <div className="text-gold-soft mb-2 text-[11px] font-bold tracking-[0.12em] uppercase">
            Scripture · Georgia serif
          </div>
          <p className="text-ink-strong font-serif text-[24px] leading-[1.55]">
            “Be still and know that I am God.”
          </p>
          <p className="text-muted-2 mt-2 text-[13.5px]">Psalm 46:10 · BSB</p>
        </div>

        <div>
          <div className="text-gold-soft mb-2 text-[11px] font-bold tracking-[0.12em] uppercase">
            Interface · Hanken Grotesk
          </div>
          <div className="space-y-2">
            <p className="text-ink-strong text-[24px] font-semibold">
              Heading — the quick brown fox
            </p>
            <p className="text-ink text-[16px]">
              Body — read the Bible, find the passage you’re thinking of, and
              explore trusted teaching connected directly to the text.
            </p>
            <p className="text-muted text-[14px]">
              Muted — secondary supporting copy.
            </p>
            <p className="text-faint text-[11px] font-bold tracking-[0.12em] uppercase">
              Eyebrow label
            </p>
            <span className="border-line-strong text-faint-2 inline-block rounded-md border px-[7px] py-[3px] font-mono text-[11px]">
              ⌘K — monospace
            </span>
          </div>
        </div>
      </div>
    </div>
  ),
};

export const Accent: Story = {
  render: () => (
    <div className="w-full max-w-[680px]">
      <SectionTitle>The accent</SectionTitle>
      <p className="text-muted mb-6 text-[14px]">
        A single gold accent — most visible as the dot in the wordmark — marks
        emphasis, active state, and provenance labels. Used sparingly.
      </p>
      <div className="flex flex-wrap items-center gap-6">
        <Logo className="text-ink-strong h-10" />
        <span className="bg-gold size-6 rounded-full" />
        <span className="border-line bg-paper-soft text-muted rounded-full border px-[14px] py-[7px] text-[13px]">
          example chip
        </span>
        <span className="text-gold-soft text-[11px] font-bold tracking-[0.12em] uppercase">
          Verse of the day
        </span>
      </div>
    </div>
  ),
};
