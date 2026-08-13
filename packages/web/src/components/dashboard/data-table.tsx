import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconSelector,
  IconSearch,
} from '@tabler/icons-react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  type TableMeta,
  useReactTable,
} from '@tanstack/react-table';
import { type ReactNode, useState } from 'react';

import { ActionIcon, Table, TextInput } from '@/components/ui';
import { cn } from '@/util/cn';

export type DataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  emptyState?: ReactNode;
  getRowId?: (row: TData, index: number, parent?: Row<TData>) => string;
  initialSorting?: SortingState;
  pageSize?: number;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  className?: string;
  meta?: TableMeta<TData>;
};

function sortLabel(direction: false | 'asc' | 'desc') {
  if (direction === 'asc') return 'Sorted ascending';
  if (direction === 'desc') return 'Sorted descending';
  return 'Not sorted';
}

function ariaSort(direction: false | 'asc' | 'desc') {
  if (direction === 'asc') return 'ascending' as const;
  if (direction === 'desc') return 'descending' as const;
  return 'none' as const;
}

export function DataTableToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-dashboard-rule bg-dashboard-raised flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DataTableSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={placeholder}
      leftSection={<IconSearch aria-hidden="true" size={16} />}
      wrapperClassName="w-full sm:max-w-xs"
      className="bg-dashboard-surface"
    />
  );
}

export function DataTable<TData>({
  data,
  columns,
  emptyState = 'No records found.',
  getRowId,
  initialSorting = [],
  pageSize = 20,
  searchPlaceholder,
  meta,
  toolbar,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    meta,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    initialState: { pagination: { pageIndex: 0, pageSize } },
    state: { globalFilter, sorting },
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const hasToolbar = Boolean(searchPlaceholder || toolbar);
  const pageCount = table.getPageCount();

  return (
    <div className={cn('dashboard-panel overflow-hidden', className)}>
      {hasToolbar ? (
        <DataTableToolbar>
          {searchPlaceholder ? (
            <DataTableSearch
              value={globalFilter}
              onChange={setGlobalFilter}
              placeholder={searchPlaceholder}
            />
          ) : (
            <div />
          )}
          {toolbar}
        </DataTableToolbar>
      ) : null}

      <Table
        highlightOnHover
        withRowBorders
        withTableBorder={false}
        className="min-w-[42rem]"
      >
        <Table.Thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <Table.Th
                    key={header.id}
                    colSpan={header.colSpan}
                    aria-sort={canSort ? ariaSort(sorted) : undefined}
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        title={`${sortLabel(sorted)}. Activate to change sorting.`}
                        className="group/sort hover:bg-dashboard-accent-soft focus-visible:ring-brand/40 -mx-2 flex min-h-8 w-[calc(100%+1rem)] items-center gap-1.5 rounded-md px-2 text-left outline-none focus-visible:ring-2"
                      >
                        <span className="min-w-0">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </span>
                        {sorted === 'asc' ? (
                          <IconChevronUp
                            aria-hidden="true"
                            size={14}
                            className="text-brand"
                          />
                        ) : sorted === 'desc' ? (
                          <IconChevronDown
                            aria-hidden="true"
                            size={14}
                            className="text-brand"
                          />
                        ) : (
                          <IconSelector
                            aria-hidden="true"
                            size={14}
                            className="text-muted opacity-50 group-hover/sort:opacity-100"
                          />
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </Table.Th>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Thead>
        <Table.Tbody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <Table.Tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <Table.Td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))
          ) : (
            <Table.Tr>
              <Table.Td colSpan={table.getVisibleLeafColumns().length}>
                <div className="text-secondary flex min-h-32 items-center justify-center px-4 text-center text-sm">
                  {emptyState}
                </div>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <div className="border-dashboard-rule bg-dashboard-raised text-secondary flex flex-col gap-3 border-t px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span aria-live="polite">
          {filteredCount.toLocaleString()}{' '}
          {filteredCount === 1 ? 'record' : 'records'}
          {globalFilter ? ` matching “${globalFilter}”` : ''}
        </span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-2">
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {pageCount}
            </span>
            <ActionIcon
              aria-label="Previous page"
              variant="default"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <IconChevronLeft size={15} />
            </ActionIcon>
            <ActionIcon
              aria-label="Next page"
              variant="default"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <IconChevronRight size={15} />
            </ActionIcon>
          </div>
        ) : null}
      </div>
    </div>
  );
}
