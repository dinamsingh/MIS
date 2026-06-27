import { describe, expect, it } from 'vitest';
import { createInMemoryAssignmentService } from './assignmentService';

describe('assignmentService — Assignment_Tracker', () => {
  it('defaults an unset cell to not-submitted', async () => {
    const svc = createInMemoryAssignmentService();
    await expect(svc.getAssignmentSubmission('a1', 's1', 'u1')).resolves.toBe('not-submitted');
  });

  it('round-trips a set status back through the getter', async () => {
    const svc = createInMemoryAssignmentService();
    await svc.setAssignmentSubmission('a1', 's1', 'u1', 'submitted');
    await expect(svc.getAssignmentSubmission('a1', 's1', 'u1')).resolves.toBe('submitted');
  });

  it('upserts in place rather than duplicating when a cell is set twice', async () => {
    const svc = createInMemoryAssignmentService();
    await svc.setAssignmentSubmission('a1', 's1', 'u1', 'submitted');
    await svc.setAssignmentSubmission('a1', 's1', 'u1', 'not-submitted');
    await expect(svc.getAssignmentSubmission('a1', 's1', 'u1')).resolves.toBe('not-submitted');
  });

  it('keeps cells independent across student, unit, and assignment', async () => {
    const svc = createInMemoryAssignmentService();
    await svc.setAssignmentSubmission('a1', 's1', 'u1', 'submitted');

    // A different student/unit/assignment is unaffected.
    await expect(svc.getAssignmentSubmission('a1', 's2', 'u1')).resolves.toBe('not-submitted');
    await expect(svc.getAssignmentSubmission('a1', 's1', 'u2')).resolves.toBe('not-submitted');
    await expect(svc.getAssignmentSubmission('a2', 's1', 'u1')).resolves.toBe('not-submitted');
    // The originally-set cell is still intact.
    await expect(svc.getAssignmentSubmission('a1', 's1', 'u1')).resolves.toBe('submitted');
  });
});

describe('assignmentService — Lab_Manual_Tracker', () => {
  it('defaults an unset cell to not-submitted', async () => {
    const svc = createInMemoryAssignmentService();
    await expect(svc.getLabManualSubmission('s1', 'u1')).resolves.toBe('not-submitted');
  });

  it('round-trips a set status back through the getter', async () => {
    const svc = createInMemoryAssignmentService();
    await svc.setLabManualSubmission('s1', 'u1', 'submitted');
    await expect(svc.getLabManualSubmission('s1', 'u1')).resolves.toBe('submitted');
  });

  it('keeps cells independent across student and unit', async () => {
    const svc = createInMemoryAssignmentService();
    await svc.setLabManualSubmission('s1', 'u1', 'submitted');
    await expect(svc.getLabManualSubmission('s2', 'u1')).resolves.toBe('not-submitted');
    await expect(svc.getLabManualSubmission('s1', 'u2')).resolves.toBe('not-submitted');
  });
});

describe('assignmentService — grid independence', () => {
  it('writing the Lab Manual tracker never affects the Assignment tracker', async () => {
    const svc = createInMemoryAssignmentService();
    await svc.setAssignmentSubmission('a1', 's1', 'u1', 'submitted');
    await svc.setLabManualSubmission('s1', 'u1', 'not-submitted');
    await expect(svc.getAssignmentSubmission('a1', 's1', 'u1')).resolves.toBe('submitted');
  });

  it('writing the Assignment tracker never affects the Lab Manual tracker', async () => {
    const svc = createInMemoryAssignmentService();
    await svc.setLabManualSubmission('s1', 'u1', 'submitted');
    await svc.setAssignmentSubmission('a1', 's1', 'u1', 'not-submitted');
    await expect(svc.getLabManualSubmission('s1', 'u1')).resolves.toBe('submitted');
  });
});
