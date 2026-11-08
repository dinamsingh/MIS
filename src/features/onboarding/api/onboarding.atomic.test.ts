import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@data/supabase', () => ({ supabase: { rpc } }));
import { saveOnboarding, fetchLiveBatches, fetchOnboardedSections } from './onboarding';

beforeEach(() => { vi.stubEnv('VITE_DEMO_MODE', 'false'); rpc.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
const profile = { name: 'Pilot Teacher', email: 'teacher@pilot.test', mustResetPassword: false };

describe('live atomic onboarding', () => {
  it('sends profile and theory/lab assignments in one RPC, with no user-supplied teacher identity', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await saveOnboarding(profile, [{ subjectId: 'subject', batchId: '2025-29', section: 'A', isLab: false }]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('save_teacher_onboarding', {
      p_name: profile.name, p_email: profile.email,
      p_assignments: [{ subject_id: 'subject', batch_id: '2025-29', section: 'A', is_lab: false }],
    });
  });
  it('surfaces the atomic server failure rather than issuing compensating/deleting writes', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'teacher_assignments_subject_section_batch_unique' } });
    await expect(saveOnboarding(profile, [])).rejects.toThrow(/already been claimed/i);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('loads the approved semester override without changing global batches', async () => {
    rpc.mockResolvedValue({ data: [{ id: '2025-29', start_year: 2025, current_sem: 3, status: 'classes', sections: ['A','B','C'] }], error: null });
    expect(await fetchLiveBatches()).toEqual([{ id: '2025-29', startYear: 2025, currentSem: 3, status: 'classes', allowedSections: ['A','B','C'] }]);
    expect(rpc).toHaveBeenCalledWith('get_my_academic_batches');
  });
  it('resolves actual section UUIDs read-only rather than creating guessed sections', async () => {
    const sections = ['A','B','C'].map(letter => ({ id: `actual-${letter}`, name: `CSE-3${letter}`, batch: '2025-29', semester: '3rd Semester', department: 'CSE' }));
    rpc.mockResolvedValue({ data: sections, error: null });
    expect(await fetchOnboardedSections()).toEqual(sections);
    expect(rpc).toHaveBeenCalledWith('get_my_teaching_sections');
  });
});
