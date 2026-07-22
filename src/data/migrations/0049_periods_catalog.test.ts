import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * One-time example test (NOT property-based): asserts the seed data in
 * migration 0049_periods_catalog.sql matches the reference weekday +
 * Saturday schedule exactly. This is a static schema/seed-data fact per
 * design.md's Testing Strategy (Requirement 13.1-13.3), so it is scoped to
 * a plain example test rather than PBT. There is no live Postgres in this
 * test environment, so the migration's raw SQL text is parsed/asserted on
 * directly instead of querying a database.
 *
 * **Validates: Requirements 13.1, 13.2, 13.3**
 */

const here = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(join(here, '0049_periods_catalog.sql'), 'utf8');

/** Extract the `insert into public.periods (...) values (...)` block's raw text. */
function extractSeedValuesBlock(sql: string): string {
  const match = sql.match(/insert into public\.periods[\s\S]*?on conflict/i);
  if (!match) {
    throw new Error('Could not locate the periods seed VALUES block in the migration file');
  }
  return match[0];
}

const seedBlock = extractSeedValuesBlock(migrationSql);

const expectedRows: Array<{
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  dayType: 'weekday' | 'saturday';
  sortOrder: number;
}> = [
  { id: 'P1', label: 'Period I', startTime: '09:30', endTime: '10:20', dayType: 'weekday', sortOrder: 1 },
  { id: 'P2', label: 'Period II', startTime: '10:20', endTime: '11:10', dayType: 'weekday', sortOrder: 2 },
  { id: 'P3', label: 'Period III', startTime: '11:10', endTime: '12:00', dayType: 'weekday', sortOrder: 3 },
  { id: 'LUNCH', label: 'Lunch Break', startTime: '12:00', endTime: '12:40', dayType: 'weekday', sortOrder: 4 },
  { id: 'P4', label: 'Period IV', startTime: '12:40', endTime: '13:30', dayType: 'weekday', sortOrder: 5 },
  { id: 'P5', label: 'Period V', startTime: '13:30', endTime: '14:20', dayType: 'weekday', sortOrder: 6 },
  { id: 'P6', label: 'Period VI', startTime: '14:20', endTime: '15:10', dayType: 'weekday', sortOrder: 7 },
  { id: 'P7', label: 'Period VII', startTime: '15:10', endTime: '16:00', dayType: 'weekday', sortOrder: 8 },
  {
    id: 'SAT_BLOCK',
    label: 'NCC/NSS/CLUB ACTIVITIES/SPORTS/NPTEL/T&P',
    startTime: '09:30',
    endTime: '13:00',
    dayType: 'saturday',
    sortOrder: 1,
  },
];

describe('migration 0049_periods_catalog.sql — seed data matches the reference schedule', () => {
  it('creates public.periods with the day_type CHECK and periods_read RLS policy', () => {
    expect(migrationSql).toMatch(/create table if not exists public\.periods/i);
    expect(migrationSql).toMatch(/check\s*\(day_type in \('weekday', 'saturday'\)\)/i);
    expect(migrationSql).toMatch(/alter table public\.periods enable row level security/i);
    expect(migrationSql).toMatch(
      /create policy periods_read on public\.periods for select to authenticated using \(true\)/i,
    );
  });

  it('contains exactly 9 seed rows', () => {
    // Each row is a parenthesized tuple starting with a quoted id.
    const rowMatches = seedBlock.match(/\('[A-Z0-9_]+',/g) ?? [];
    expect(rowMatches).toHaveLength(9);
  });

  it.each(expectedRows)(
    'includes row $id with label "$label", $startTime-$endTime, $dayType, sort_order $sortOrder',
    ({ id, label, startTime, endTime, dayType, sortOrder }) => {
      const rowPattern = new RegExp(
        `\\('${id}',\\s*'${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',\\s*'${startTime}',\\s*'${endTime}',\\s*'${dayType}',\\s*${sortOrder}\\)`,
      );
      expect(seedBlock).toMatch(rowPattern);
    },
  );

  it('ends the migration with a schema reload notification', () => {
    expect(migrationSql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
