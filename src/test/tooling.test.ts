import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

// Smoke test confirming the Vitest + fast-check tooling is wired up correctly.
describe('tooling setup', () => {
  it('runs Vitest assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('runs fast-check property tests', () => {
    // No explicit numRuns: inherits the reduced global setting from setup.ts.
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
    );
  });
});
