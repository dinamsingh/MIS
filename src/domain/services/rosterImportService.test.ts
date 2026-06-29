import { describe, expect, it } from 'vitest';
import { parseRosterCsv } from './rosterImportService';
import { messages } from '../shared/messages';

describe('parseRosterCsv', () => {
  it('parses valid rows under the enrollment,name header', () => {
    const csv = ['enrollment,name', '0131CS241000,Aarav Mehta', '0131CS241001,Diya Sharma'].join('\n');

    const result = parseRosterCsv(csv);

    expect(result.rejected).toHaveLength(0);
    expect(result.valid).toEqual([
      { enrollmentNumber: '0131CS241000', name: 'Aarav Mehta' },
      { enrollmentNumber: '0131CS241001', name: 'Diya Sharma' },
    ]);
  });

  it('tolerates the absence of a header row', () => {
    const csv = '0131CS241000,Aarav Mehta';

    const result = parseRosterCsv(csv);

    expect(result.valid).toEqual([{ enrollmentNumber: '0131CS241000', name: 'Aarav Mehta' }]);
    expect(result.rejected).toHaveLength(0);
  });

  it('recognises the enrollment_number header alias and is case-insensitive', () => {
    const csv = ['Enrollment_Number,Name', '0131CS241000,Aarav Mehta'].join('\n');

    const result = parseRosterCsv(csv);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.enrollmentNumber).toBe('0131CS241000');
  });

  it('trims surrounding whitespace from both cells', () => {
    const csv = '  0131CS241000 ,  Aarav Mehta  ';

    const result = parseRosterCsv(csv);

    expect(result.valid).toEqual([{ enrollmentNumber: '0131CS241000', name: 'Aarav Mehta' }]);
  });

  it('preserves commas inside the name by splitting on the first comma only', () => {
    const csv = '0131CS241000,Mehta, Aarav';

    const result = parseRosterCsv(csv);

    expect(result.valid).toEqual([{ enrollmentNumber: '0131CS241000', name: 'Mehta, Aarav' }]);
  });

  it('rejects an invalid enrollment number with the invalid-enrollment reason', () => {
    const csv = ['enrollment,name', 'NOTVALID,Aarav Mehta'].join('\n');

    const result = parseRosterCsv(csv);

    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      line: 2,
      reason: 'invalid-enrollment',
      message: messages.rosterImport.invalidEnrollment,
    });
  });

  it('rejects a row whose name cell is blank as missing-name', () => {
    const csv = '0131CS241000,';

    const result = parseRosterCsv(csv);

    expect(result.valid).toHaveLength(0);
    expect(result.rejected[0]?.reason).toBe('missing-name');
  });

  it('rejects a line with no comma as malformed', () => {
    const csv = '0131CS241000';

    const result = parseRosterCsv(csv);

    expect(result.valid).toHaveLength(0);
    expect(result.rejected[0]).toMatchObject({ line: 1, reason: 'malformed' });
  });

  it('keeps the first occurrence and rejects later duplicates by enrollment number', () => {
    const csv = [
      'enrollment,name',
      '0131CS241000,Aarav Mehta',
      '0131CS241000,Aarav M.',
    ].join('\n');

    const result = parseRosterCsv(csv);

    expect(result.valid).toEqual([{ enrollmentNumber: '0131CS241000', name: 'Aarav Mehta' }]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ line: 3, reason: 'duplicate' });
  });

  it('skips blank lines (including whitespace-only and CRLF) without rejecting them', () => {
    const csv = [
      'enrollment,name',
      '',
      '0131CS241000,Aarav Mehta',
      '   ',
      '0131CS241001,Diya Sharma',
      '',
    ].join('\r\n');

    const result = parseRosterCsv(csv);

    expect(result.valid).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it('returns empty result for empty input', () => {
    expect(parseRosterCsv('')).toEqual({ valid: [], rejected: [] });
  });

  it('does not skip a data row that reads like a header after the first data line', () => {
    // The header is consumed once; a later "enrollment,..." line is data and is
    // rejected because "enrollment" is not a valid enrollment number.
    const csv = ['enrollment,name', '0131CS241000,Aarav Mehta', 'enrollment,Repeat Header'].join('\n');

    const result = parseRosterCsv(csv);

    expect(result.valid).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ line: 3, reason: 'invalid-enrollment' });
  });
});
