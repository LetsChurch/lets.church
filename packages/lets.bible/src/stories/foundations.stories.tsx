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
    <h2 className="mb-1 font-serif text-[26px] text-ink-strong">{children}</h2>
  );
}

export const Colors: Story = {
  render: () => (
    <div className="w-full max-w-[900px]">
      <SectionTitle>Color</SectionTitle>
      <p className="mb-6 text-[14px] text-muted">
        Warm neutrals with a single gold accent and a sage-slate secondary. Hex
        values are light mode — toggle the theme to preview dark.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SWATCHES.map((s) => (
          <div
            key={s.name}
            className="overflow-hidden rounded-xl border border-line bg-paper-raised"
          >
            <div className={`h-16 w-full ${s.cls}`} />
            <div className="px-3 py-2">
              <div className="font-mono text-[12px] text-ink">{s.name}</div>
              <div className="text-[12px] text-muted-2">{s.role}</div>
              <div className="font-mono text-[11px] text-faint">{s.light}</div>
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
      <p className="mb-8 text-[14px] text-muted">
        The wordmark is set in Begum Bold (shipped as outlined logo artwork);
        Georgia carries scripture; Hanken Grotesk carries the interface.
      </p>

      <div className="space-y-8">
        <div>
          <div className="mb-2 font-bold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
            Wordmark · Begum Bold
          </div>
          <Logo className="h-9 text-ink-strong" />
        </div>

        <div>
          <div className="mb-2 font-bold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
            Scripture · Georgia serif
          </div>
          <p className="font-serif text-[24px] text-ink-strong leading-[1.55]">
            “Be still and know that I am God.”
          </p>
          <p className="mt-2 text-[13.5px] text-muted-2">Psalm 46:10 · BSB</p>
        </div>

        <div>
          <div className="mb-2 font-bold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
            Interface · Hanken Grotesk
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-[24px] text-ink-strong">
              Heading — the quick brown fox
            </p>
            <p className="text-[16px] text-ink">
              Body — read the Bible, find the passage you’re thinking of, and
              explore trusted teaching connected directly to the text.
            </p>
            <p className="text-[14px] text-muted">
              Muted — secondary supporting copy.
            </p>
            <p className="font-bold text-[11px] text-faint uppercase tracking-[0.12em]">
              Eyebrow label
            </p>
            <span className="inline-block rounded-md border border-line-strong px-[7px] py-[3px] font-mono text-[11px] text-faint-2">
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
      <p className="mb-6 text-[14px] text-muted">
        A single gold accent — most visible as the dot in the wordmark — marks
        emphasis, active state, and provenance labels. Used sparingly.
      </p>
      <div className="flex flex-wrap items-center gap-6">
        <Logo className="h-10 text-ink-strong" />
        <span className="size-6 rounded-full bg-gold" />
        <span className="rounded-full border border-line bg-paper-soft px-[14px] py-[7px] text-[13px] text-muted">
          example chip
        </span>
        <span className="font-bold text-[11px] text-gold-soft uppercase tracking-[0.12em]">
          Verse of the day
        </span>
      </div>
    </div>
  ),
};
