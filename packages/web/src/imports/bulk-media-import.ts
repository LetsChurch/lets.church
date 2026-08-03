import { parse } from 'csv-parse/sync';

export const MAX_BULK_MEDIA_IMPORT_BYTES = 64 * 1024 * 1024;

export type BulkMediaImportItem = {
  url: string;
  title: string;
  description?: string;
  publishedAt?: string;
};

type CsvRow = Record<string, string>;

function normalizedHeader(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

function rowValues(row: CsvRow) {
  return new Map(
    Object.entries(row).map(([key, entryValue]) => [
      normalizedHeader(key),
      entryValue.trim(),
    ]),
  );
}

function value(values: Map<string, string>, ...names: string[]) {
  for (const name of names) {
    const entryValue = values.get(normalizedHeader(name));
    if (entryValue) return entryValue;
  }
  return '';
}

function hasHeader(row: CsvRow, ...names: string[]) {
  const headers = new Set(Object.keys(row).map(normalizedHeader));
  return names.some((name) => headers.has(normalizedHeader(name)));
}

function publishedAt(value: string, rowNumber: number) {
  if (!value) return undefined;

  const calendarDate = value.slice(0, 10);
  const calendarCheck = new Date(`${calendarDate}T12:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(calendarDate) ||
    Number.isNaN(calendarCheck.getTime()) ||
    calendarCheck.toISOString().slice(0, 10) !== calendarDate
  ) {
    throw new Error(
      `Row ${rowNumber} has an invalid publishedAt value. Use an ISO 8601 date or timestamp.`,
    );
  }

  let normalized: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    normalized = `${value}T00:00:00.000Z`;
  } else if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)
  ) {
    normalized = `${value.replace(' ', 'T')}Z`;
  } else if (
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    normalized = value.replace(' ', 'T');
  } else {
    throw new Error(
      `Row ${rowNumber} has an invalid publishedAt value. Use an ISO 8601 date or timestamp.`,
    );
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Row ${rowNumber} has an invalid publishedAt value. Use an ISO 8601 date or timestamp.`,
    );
  }
  return parsed.toISOString();
}

function mediaUrl(value: string, rowNumber: number) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Row ${rowNumber} has an invalid URL.`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Row ${rowNumber} must use an HTTP or HTTPS URL.`);
  }
  if (value.length > 2_048) {
    throw new Error(`Row ${rowNumber} has a URL longer than 2,048 characters.`);
  }
  return parsed.toString();
}

export function parseBulkMediaImportCsv(csv: string): BulkMediaImportItem[] {
  if (new TextEncoder().encode(csv).byteLength > MAX_BULK_MEDIA_IMPORT_BYTES) {
    throw new Error('The CSV file cannot be larger than 64 MiB.');
  }

  let rows: CsvRow[];
  try {
    rows = parse(csv, {
      bom: true,
      columns: true,
      max_record_size: 20_000,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`The CSV file could not be parsed.${detail}`);
  }

  if (rows.length === 0) {
    throw new Error('The CSV file has no media rows.');
  }
  const firstRow = rows[0]!;
  const missingHeaders = [
    {
      label: 'url',
      present: hasHeader(firstRow, 'url', 'media url', 'source url'),
    },
    { label: 'title', present: hasHeader(firstRow, 'title') },
  ]
    .filter(({ present }) => !present)
    .map(({ label }) => label);
  if (missingHeaders.length > 0) {
    throw new Error(
      `The CSV file is missing required columns: ${missingHeaders.join(', ')}.`,
    );
  }

  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const values = rowValues(row);
    const url = value(values, 'url', 'media url', 'source url');
    const title = value(values, 'title');
    const description = value(values, 'description', 'summary');
    const publishedAtValue = value(
      values,
      'publishedAt',
      'published at',
      'published date',
      'publish date',
      'date',
    );

    if (!url) throw new Error(`Row ${rowNumber} needs a URL.`);
    if (!title) throw new Error(`Row ${rowNumber} needs a title.`);
    if (title.length > 500) {
      throw new Error(
        `Row ${rowNumber} has a title longer than 500 characters.`,
      );
    }
    if (description.length > 10_000) {
      throw new Error(
        `Row ${rowNumber} has a description longer than 10,000 characters.`,
      );
    }

    return {
      url: mediaUrl(url, rowNumber),
      title,
      ...(description ? { description } : {}),
      ...(publishedAtValue
        ? { publishedAt: publishedAt(publishedAtValue, rowNumber) }
        : {}),
    };
  });
}
