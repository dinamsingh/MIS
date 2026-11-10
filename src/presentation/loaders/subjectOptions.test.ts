import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc, from, filters } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), filters: [] as unknown[][] }));
vi.mock('@data/supabase', () => ({ supabase: {
  rpc, from, auth: { getSession: async () => ({ data: { session: { user: { id: 'teacher' } } } }) },
} }));
import { loadSubjectOptionsForSection } from './subjectOptions';

beforeEach(() => {
  vi.stubEnv('VITE_DEMO_MODE', 'false'); filters.length = 0;
  rpc.mockResolvedValue({ data: [{ id: '2025-29', start_year: 2025, current_sem: 3, status: 'classes', sections: ['A','B','C'] }], error: null });
  from.mockImplementation((table: string) => {
    const chain = {
      select: () => chain,
      eq: (...args: unknown[]) => { filters.push(args); return chain; },
      in: () => chain,
      order: async () => ({ data: [{ id: 'subject3', code: 'CS-303', name: 'Data Structure', sem: 3 }, { id: 'subject5', code: 'CS-501', name: 'Old semester', sem: 5 }], error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: table === 'teacher_assignments' ? [{ subject_id: 'subject3' }, { subject_id: 'subject5' }] : [], error: null }),
    };
    return chain;
  });
});
afterEach(() => vi.unstubAllEnvs());
const section = (letter: string, semester = '3rd Semester', batch = '2025-29') => ({ id: 'uuid-ending-C', name: `CSE-${parseInt(semester)}${letter}`, batch, semester, department: 'CSE' });

describe('approved pilot subject options', () => {
  for (const letter of ['A','B','C']) {
    it(`selects only approved Semester 3 subjects for section ${letter}`, async () => {
      expect(await loadSubjectOptionsForSection(section(letter))).toEqual([{ id: 'subject3', name: 'CS-303 - Data Structure' }]);
      expect(filters).toContainEqual(['section', letter]);
      expect(rpc).toHaveBeenCalledWith('get_my_academic_batches');
    });
  }
  it('does not confuse the same section letter in another semester', async () => {
    expect(await loadSubjectOptionsForSection(section('A','4th Semester'))).toEqual([]);
  });
  it('does not confuse the same section letter in another batch', async () => {
    expect(await loadSubjectOptionsForSection(section('A','3rd Semester','2024-28'))).toEqual([]);
  });
  it('does not use CSE assignments for another department', async () => {
    expect(await loadSubjectOptionsForSection({ ...section('A'), department: 'ECE' })).toEqual([]);
  });
});
