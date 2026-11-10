import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRosterImportAccess } from './rosterImportAccess';
import { DataAccessError } from './support';

const rows = [{ enrollmentNumber: '0131CS251001', name: 'Verified Student', email: null }];
const summary = { imported: 1, inserted: 1, updated: 0, unchanged: 0, deleted: 0 };
function client(error: { message: string; code: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data: error ? null : summary, error });
  // There is intentionally no table API: any delete/insert fallback fails the test.
  return { rpc, db: { rpc } as unknown as SupabaseClient };
}

describe('atomic roster import', () => {
  it('performs exactly one coordinated authenticated RPC with the explicit section ID', async () => {
    const { rpc, db } = client();
    expect(await createRosterImportAccess(db).replaceSection('real-section-id', rows)).toEqual(summary);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('import_section_roster', {
      p_section_id: 'real-section-id',
      p_rows: [{ enrollment_number: '0131CS251001', name: 'Verified Student', email: null }],
    });
  });
  it('reports server rollback errors without destructive fallback writes', async () => {
    const { rpc, db } = client({ code: '23505', message: 'Enrollment belongs to another section' });
    await expect(createRosterImportAccess(db).replaceSection('section-a', rows)).rejects.toBeInstanceOf(DataAccessError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('surfaces authorization failures', async () => {
    const { db } = client({ code: '42501', message: 'Unauthorized section' });
    await expect(createRosterImportAccess(db).replaceSection('unrelated', rows)).rejects.toMatchObject({ code: '42501' });
  });
  it('retries send the identical enrollment identity and never a teacher ID', async () => {
    const { rpc, db } = client();
    const access = createRosterImportAccess(db);
    await access.replaceSection('section-a', rows);
    await access.replaceSection('section-a', rows);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('teacher_id');
  });
  it('never implements empty input as a client-side clear operation', async () => {
    const { rpc, db } = client({ code: 'P0001', message: 'Upload between 1 and 2000 valid CSV rows.' });
    await expect(createRosterImportAccess(db).replaceSection('section-a', [])).rejects.toBeInstanceOf(DataAccessError);
    expect(rpc).toHaveBeenCalledWith('import_section_roster', { p_section_id: 'section-a', p_rows: [] });
  });
});
