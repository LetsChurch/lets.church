import { describe, expect, it } from 'vitest';

import { donationCsvCell } from './csv';

describe('donationCsvCell', () => {
  it('quotes values and escapes double quotes', () => {
    expect(donationCsvCell('A "quoted" name')).toBe('"A ""quoted"" name"');
  });

  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1:A2)', '\tformula', '\rformula'])(
    'blocks spreadsheet formulas in %s',
    (value) => {
      expect(donationCsvCell(value)).toBe(`"'${value}"`);
    },
  );

  it('keeps numbers and empty cells intact', () => {
    expect(donationCsvCell(25)).toBe('"25"');
    expect(donationCsvCell(null)).toBe('""');
  });
});
