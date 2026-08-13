import type { Meta, StoryObj } from '@storybook/react';
import type { ColumnDef } from '@tanstack/react-table';

import { Badge, Button } from '@/components/ui';

import { DataTable, type DataTableProps } from './data-table';

type MediaRecord = {
  title: string;
  channel: string;
  status: 'Published' | 'Processing' | 'Needs review';
  publishedAt: string;
  plays: number;
};

const records: MediaRecord[] = [
  {
    title: 'The Hope Set Before Us',
    channel: 'Redeemer Fellowship',
    status: 'Published',
    publishedAt: '2026-08-11',
    plays: 1842,
  },
  {
    title: 'Psalm 23: The Shepherd King',
    channel: 'Grace Church',
    status: 'Processing',
    publishedAt: '2026-08-13',
    plays: 0,
  },
  {
    title: 'Faithful in Exile',
    channel: 'Covenant Bible Church',
    status: 'Needs review',
    publishedAt: '2026-08-12',
    plays: 384,
  },
  {
    title: 'The Work of Reconciliation',
    channel: 'Redeemer Fellowship',
    status: 'Published',
    publishedAt: '2026-08-09',
    plays: 925,
  },
  {
    title: 'Wisdom at the Crossroads',
    channel: 'Grace Church',
    status: 'Published',
    publishedAt: '2026-08-03',
    plays: 1206,
  },
];

const columns: ColumnDef<MediaRecord>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => (
      <div>
        <div className="text-dashboard-ink font-medium">
          {row.original.title}
        </div>
        <div className="text-secondary mt-0.5 text-xs">
          {row.original.channel}
        </div>
      </div>
    ),
  },
  { accessorKey: 'channel', header: 'Channel' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = getValue<MediaRecord['status']>();
      const color =
        status === 'Published'
          ? 'green'
          : status === 'Processing'
            ? 'blue'
            : 'yellow';
      return <Badge color={color}>{status}</Badge>;
    },
  },
  {
    accessorKey: 'publishedAt',
    header: 'Published',
    cell: ({ getValue }) =>
      new Date(getValue<string>()).toLocaleDateString('en-US', {
        timeZone: 'UTC',
      }),
  },
  {
    accessorKey: 'plays',
    header: 'Plays',
    cell: ({ getValue }) => getValue<number>().toLocaleString(),
  },
];

function MediaDataTable(props: DataTableProps<MediaRecord>) {
  return <DataTable {...props} />;
}

const meta = {
  title: 'Dashboard/Data table',
  component: MediaDataTable,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="bg-dashboard-canvas min-h-screen p-5 sm:p-8">
        <div className="mx-auto max-w-6xl">
          <Story />
        </div>
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof MediaDataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SortFilterAndPaginate: Story = {
  args: {
    data: records,
    columns,
    pageSize: 3,
    searchPlaceholder: 'Search media',
    initialSorting: [{ id: 'publishedAt', desc: true }],
    toolbar: <Button size="sm">Add media</Button>,
  },
};

export const Empty: Story = {
  args: {
    data: [],
    columns,
    searchPlaceholder: 'Search records',
    emptyState: 'No media records match this view.',
  },
};
