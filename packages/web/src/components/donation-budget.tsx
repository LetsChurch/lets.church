import { Accordion } from '@base-ui/react/accordion';
import { IconChevronDown } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { Text, Title } from '@/components/ui';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';

const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

// Stacked-bar segments, in category order; repeats past six categories.
// `pill` pairs each fill with a text color that clears 4.5:1 on it.
const SEGMENT_COLORS = [
  { fill: 'bg-brand', pill: 'bg-brand text-white' },
  { fill: 'bg-teal-500', pill: 'bg-teal-500 text-zinc-950' },
  { fill: 'bg-amber-500', pill: 'bg-amber-500 text-zinc-950' },
  { fill: 'bg-rose-500', pill: 'bg-rose-500 text-zinc-950' },
  { fill: 'bg-sky-500', pill: 'bg-sky-500 text-zinc-950' },
  { fill: 'bg-lime-500', pill: 'bg-lime-500 text-zinc-950' },
];

function formatMonthly(cents: number) {
  return wholeDollars.format(cents / 100);
}

function Row({
  label,
  amountCents,
  emphasis,
  className,
}: {
  label: string;
  amountCents: number;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-1.5 text-sm',
        emphasis && 'text-base font-semibold',
        className,
      )}
    >
      <dt className={emphasis ? undefined : 'text-secondary'}>{label}</dt>
      <dd className="text-primary tabular-nums">
        {formatMonthly(amountCents)}
      </dd>
    </div>
  );
}

function FaqItem({
  value,
  question,
  children,
}: {
  value: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <Accordion.Item
      value={value}
      className="border-b border-gray-200 last:border-b-0 dark:border-zinc-800"
    >
      <Accordion.Header>
        <Accordion.Trigger className="group text-primary flex w-full items-center justify-between gap-4 py-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
          {question}
          <IconChevronDown
            aria-hidden
            size={16}
            className="text-secondary shrink-0 transition-transform group-data-[panel-open]:rotate-180"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel className="text-secondary flex flex-col gap-2 pb-3 text-sm leading-relaxed">
        {children}
      </Accordion.Panel>
    </Accordion.Item>
  );
}

/**
 * Public breakdown of monthly costs against scheduled monthly giving. Renders
 * nothing until an admin adds at least one category.
 */
export function DonationBudget() {
  const trpc = useTRPC();
  const { data: budget } = useSuspenseQuery(
    trpc.donations.getBudget.queryOptions(),
  );
  // Hovering a segment or legend row spotlights that category and reveals its
  // share; the percentages stay in the DOM for screen readers either way.
  const [activeId, setActiveId] = useState<string | null>(null);

  if (budget.categories.length === 0) return null;

  const coveredPercent =
    budget.expensesCents > 0
      ? Math.round((budget.incomeCents / budget.expensesCents) * 100)
      : 100;
  const shortfall = budget.differenceCents < 0;
  const categories = budget.categories.map((category, index) => ({
    ...category,
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
    share:
      budget.expensesCents > 0
        ? (category.monthlyAmountCents / budget.expensesCents) * 100
        : 0,
  }));

  return (
    <section
      aria-labelledby="donation-budget-title"
      className="lg:border-fancy-pants max-w-xl lg:rounded-lg lg:bg-white lg:p-5 lg:shadow-sm lg:dark:bg-zinc-900"
    >
      <Title order={2} id="donation-budget-title" className="mb-1 text-lg">
        Where your gift goes
      </Title>
      <Text size="sm" c="dimmed" className="mb-4">
        What it costs to run Let&apos;s Church each month.
      </Text>

      <div
        aria-hidden
        className="mb-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-800"
      >
        {categories.map((category) => (
          <div
            key={category.id}
            onMouseEnter={() => setActiveId(category.id)}
            onMouseLeave={() => setActiveId(null)}
            className={cn(
              'h-full transition-opacity duration-300 motion-reduce:transition-none',
              category.color.fill,
              activeId && activeId !== category.id && 'opacity-30',
            )}
            style={{ flex: `${category.share} 1 0` }}
          />
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {categories.map((category) => (
          <li
            key={category.id}
            onMouseEnter={() => setActiveId(category.id)}
            onMouseLeave={() => setActiveId(null)}
            className={cn(
              'flex gap-2.5 transition-opacity duration-300 motion-reduce:transition-none',
              activeId && activeId !== category.id && 'opacity-50',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-1.5 size-2.5 shrink-0 rounded-sm',
                category.color.fill,
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-primary font-medium">
                  {category.name}
                </span>
                <span className="text-primary flex items-baseline tabular-nums">
                  {formatMonthly(category.monthlyAmountCents)}
                  <span
                    className={cn(
                      'grid transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none',
                      activeId === category.id
                        ? 'grid-cols-[1fr]'
                        : 'grid-cols-[0fr]',
                    )}
                  >
                    <span className="overflow-hidden">
                      <span
                        className={cn(
                          'ml-2 inline-block rounded-full px-1.5 py-0.5 text-xs font-semibold transition-[opacity,translate,filter] duration-300 ease-out motion-reduce:transition-none',
                          category.color.pill,
                          activeId === category.id
                            ? 'translate-x-0 opacity-100 blur-none'
                            : 'translate-x-2 opacity-0 blur-xs',
                        )}
                      >
                        {Math.round(category.share)}%
                      </span>
                    </span>
                  </span>
                </span>
              </div>
              {category.description ? (
                <Text size="xs" c="dimmed">
                  {category.description}
                </Text>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <dl className="mt-5 border-t border-gray-200 pt-3 dark:border-zinc-800">
        <Row label="Monthly costs" amountCents={budget.expensesCents} />
        <Row label="Monthly giving" amountCents={budget.incomeCents} />
        <Row
          emphasis
          label={shortfall ? 'Monthly shortfall' : 'Monthly surplus'}
          amountCents={Math.abs(budget.differenceCents)}
          className="mt-1 border-t border-gray-200 pt-2.5 dark:border-zinc-800"
        />
      </dl>

      <div
        aria-hidden
        className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-800"
      >
        <div
          className={cn(
            'h-full rounded-full',
            shortfall ? 'bg-brand' : 'bg-green-500',
          )}
          style={{ width: `${Math.min(100, coveredPercent)}%` }}
        />
      </div>
      <Text size="xs" c="dimmed" className="mt-1.5">
        Monthly giving covers {coveredPercent}% of our costs.
        {shortfall ? ' A monthly gift helps close the gap.' : ''}
      </Text>

      <Accordion.Root className="mt-4 border-t border-gray-200 dark:border-zinc-800">
        {shortfall ? (
          <FaqItem value="shortfall" question="How is the shortfall covered?">
            <p>
              Through generous one-time gifts. Monthly gifts build on that
              generosity and give us a steady foundation to plan from.
            </p>
          </FaqItem>
        ) : null}
        <FaqItem value="monthly" question="Why give monthly?">
          <p>
            A monthly gift of any size helps us look ahead. Knowing what to
            expect each month lets us plan for growth: room for more sermons,
            better tools for churches, and new ways to serve the body of Christ.
          </p>
        </FaqItem>
      </Accordion.Root>
    </section>
  );
}
