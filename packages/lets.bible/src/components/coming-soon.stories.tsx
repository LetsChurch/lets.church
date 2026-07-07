import type { Meta, StoryObj } from '@storybook/react';

import { ComingSoon } from './coming-soon';

const meta = {
  title: 'Components/ComingSoon',
  component: ComingSoon,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[720px] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ComingSoon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reader: Story = {
  args: {
    eyebrow: 'Reader',
    title: 'The reading view',
    blurb:
      'A calm, scripture-first reader with poetry, red-letter, and original-language layers — navigation, cross-references, and the study panel all on one continuous surface.',
  },
};

export const Search: Story = {
  args: {
    eyebrow: 'Search',
    title: 'Unified search',
    blurb:
      'References, exact phrases, cross-references, and AI-assisted related passages — each labeled with why it matched.',
  },
};
