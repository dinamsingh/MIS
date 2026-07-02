import { describe, expect, it } from 'vitest';
import { applyPresentList, parsePresentTokens, previewPresentList } from './quickAttendance';

const roster = [
  { id: 'a', enrollmentNumber: '0131CS241001' }, // 001
  { id: 'b', enrollmentNumber: '0131CS241002' }, // 002
  { id: 'c', enrollmentNumber: '0131CS241067' }, // 067
  { id: 'd', enrollmentNumber: '0131CS243D01' }, // D01
];

describe('parsePresentTokens', () => {
  it('splits on commas, trims, upper-cases, and de-duplicates', () => {
    expect(parsePresentTokens(' 001, 002 ,001 , d01 ')).toEqual(['001', '002', 'D01']);
  });

  it('tolerates whitespace/newlines as separators and drops empties', () => {
    expect(parsePresentTokens('001\n002 067,,')).toEqual(['001', '002', '067']);
  });

  it('returns an empty list for blank input', () => {
    expect(parsePresentTokens('   ')).toEqual([]);
  });

  it('left-pads short tokens with zeros to three characters', () => {
    expect(parsePresentTokens('48, 5, 007, 001')).toEqual(['048', '005', '007', '001']);
  });
});

describe('applyPresentList — zero padding', () => {
  it('matches a 2-digit token by padding it (48 -> 048)', () => {
    const padRoster = [
      { id: 'e', enrollmentNumber: '0131CS241048' }, // 048
      { id: 'f', enrollmentNumber: '0131CS241050' }, // 050
    ];
    const result = applyPresentList(padRoster, '48');
    expect(result.statusById).toEqual({ e: 'present' });
    expect(result.notFound).toEqual([]);
  });
});

describe('applyPresentList', () => {
  it('marks matched students present and everyone else absent in first-time mode', () => {
    const result = applyPresentList(roster, '001, 067', { mode: 'first-time' });
    expect(result.statusById).toEqual({ a: 'present', b: 'absent', c: 'present', d: 'absent' });
    expect(result.matchedCount).toBe(2);
    expect(result.notFound).toEqual([]);
    expect(result.ambiguous).toEqual([]);
  });

  it('marks matched students present without changing everyone else', () => {
    const result = applyPresentList(roster, '001, 067');
    expect(result.statusById).toEqual({ a: 'present', c: 'present' });
    expect(result.matchedCount).toBe(2);
    expect(result.notFound).toEqual([]);
    expect(result.ambiguous).toEqual([]);
  });

  it('matches alphanumeric trailing segments like D01 (case-insensitive)', () => {
    const result = applyPresentList(roster, 'd01');
    expect(result.statusById.d).toBe('present');
    expect(result.statusById.a).toBeUndefined();
    expect(result.matchedCount).toBe(1);
  });

  it('reports tokens that match no student as notFound', () => {
    const result = applyPresentList(roster, '001, 999, D05');
    expect(result.statusById.a).toBe('present');
    expect(result.notFound).toEqual(['999', 'D05']);
    expect(result.matchedCount).toBe(1);
  });

  it('reports ambiguous tokens that match more than one student (and marks both present)', () => {
    const dupRoster = [
      { id: 'x', enrollmentNumber: '0131CS241001' }, // 001
      { id: 'y', enrollmentNumber: '9999ZZ999001' }, // 001 (same last three)
      { id: 'z', enrollmentNumber: '0131CS241002' }, // 002
    ];
    const result = applyPresentList(dupRoster, '001');
    expect(result.ambiguous).toEqual(['001']);
    expect(result.statusById).toEqual({ x: 'present', y: 'present' });
    expect(result.matchedCount).toBe(2);
  });

  it('does not change anyone when the input is empty', () => {
    const result = applyPresentList(roster, '');
    expect(result.statusById).toEqual({});
    expect(result.matchedCount).toBe(0);
  });

  it('marks everyone absent for an empty input in first-time mode', () => {
    const result = applyPresentList(roster, '', { mode: 'first-time' });
    expect(result.statusById).toEqual({ a: 'absent', b: 'absent', c: 'absent', d: 'absent' });
    expect(result.matchedCount).toBe(0);
  });

  it('ignores students without an enrollment number when matching', () => {
    const result = applyPresentList([{ id: 'n' }, ...roster], '001');
    expect(result.statusById.n).toBeUndefined();
    expect(result.statusById.a).toBe('present');
  });
});

describe('previewPresentList', () => {
  it('lists matched students (in roster order) with the token that matched', () => {
    const preview = applyPreview('067, 001');
    expect(preview.matched).toEqual([
      { id: 'a', token: '001' },
      { id: 'c', token: '067' },
    ]);
    expect(preview.notFound).toEqual([]);
    expect(preview.ambiguous).toEqual([]);
  });

  it('separates not-found and ambiguous tokens without changing anything', () => {
    const preview = applyPreview('001, 999');
    expect(preview.matched.map((m) => m.id)).toEqual(['a']);
    expect(preview.notFound).toEqual(['999']);
  });
});

function applyPreview(input: string) {
  return previewPresentList(roster, input);
}
