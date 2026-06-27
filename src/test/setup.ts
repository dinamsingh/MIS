import '@testing-library/jest-dom/vitest';
import fc from 'fast-check';

// Reduce property-based test examples globally so the suite runs faster.
// Individual tests may still override numRuns when a property warrants more
// thorough exploration. Override via the FC_NUM_RUNS env var if needed.
const numRuns = Number(process.env.FC_NUM_RUNS ?? 25);
fc.configureGlobal({ numRuns: Number.isFinite(numRuns) && numRuns > 0 ? numRuns : 25 });
