/**
 * Quick attendance by "present list".
 *
 * Instead of toggling each student, the teacher pastes a comma-separated list of
 * the LAST THREE characters of the present students' enrollment numbers (the
 * trailing segment may include letters, e.g. `D01` for a back-semester student).
 * Every matched student is marked `present`. In first-time mode, students who
 * are not included in the pasted list are marked `absent`; in correction mode,
 * they are intentionally left unchanged so past-date edits are safe.
 *
 * Pure and synchronous so it can be unit-tested in isolation from the UI.
 */

import type { AttendanceStatus } from './attendanceService';

/** Minimal student shape the matcher needs. */
export interface QuickAttendanceStudent {
  readonly id: string;
  readonly enrollmentNumber?: string;
}

/** Outcome of applying a pasted roll-list to a roster. */
export interface PresentListResult {
  /** Per-student status updates. Correction mode includes only matched students. */
  readonly statusById: Record<string, AttendanceStatus>;
  /** Tokens (as entered) that matched no student in the roster. */
  readonly notFound: string[];
  /** Tokens that matched more than one student. Ambiguous tokens mark nobody. */
  readonly ambiguous: string[];
  /** How many students were explicitly matched and updated. */
  readonly matchedCount: number;
}

export type PresentListApplyMode = 'first-time' | 'correction';

export interface PresentListApplyOptions {
  /**
   * `first-time` is for taking a fresh class attendance from a present list:
   * matched students become Present, the rest become Absent.
   *
   * `correction` is for editing an existing period: matched students become
   * Present and everyone else stays unchanged.
   */
  readonly mode?: PresentListApplyMode;
}

/** Normalize the trailing key used for matching: last 3 chars, upper-cased. */
function lastThree(value: string): string {
  return value.trim().toUpperCase().slice(-3);
}

/** A single matched entry for the confirmation preview. */
export interface PresentListMatch {
  /** The roster student id that matched. */
  readonly id: string;
  /** The pasted token (last-3 chars) that matched this student. */
  readonly token: string;
}

/** Preview of what a pasted present-list will do, shown before confirming. */
export interface PresentListPreview {
  /** Students that uniquely matched a pasted token (each with the token that matched). */
  readonly matched: PresentListMatch[];
  /** Tokens that matched no student in the roster. */
  readonly notFound: string[];
  /** Tokens that matched more than one student. */
  readonly ambiguous: string[];
}

/**
 * Build a preview (without changing anything) of which students a pasted
 * present-list would mark present, so the teacher can confirm first. Matched
 * entries preserve roster order.
 */
export function previewPresentList(
  roster: ReadonlyArray<QuickAttendanceStudent>,
  input: string,
): PresentListPreview {
  const tokens = new Set(parsePresentTokens(input));

  // token -> student ids (to detect not-found / ambiguous)
  const idsByToken = new Map<string, string[]>();
  for (const student of roster) {
    if (!student.enrollmentNumber) {
      continue;
    }
    const key = lastThree(student.enrollmentNumber);
    if (!tokens.has(key)) {
      continue;
    }
    const existing = idsByToken.get(key);
    if (existing) {
      existing.push(student.id);
    } else {
      idsByToken.set(key, [student.id]);
    }
  }

  const matched: PresentListMatch[] = [];
  for (const student of roster) {
    if (!student.enrollmentNumber) {
      continue;
    }
    const key = lastThree(student.enrollmentNumber);
    if (idsByToken.get(key)?.length === 1) {
      matched.push({ id: student.id, token: key });
    }
  }

  const notFound: string[] = [];
  const ambiguous: string[] = [];
  for (const token of tokens) {
    const ids = idsByToken.get(token);
    if (!ids || ids.length === 0) {
      notFound.push(token);
    } else if (ids.length > 1) {
      ambiguous.push(token);
    }
  }

  return { matched, notFound, ambiguous };
}

/**
 * Split the pasted input into normalized, de-duplicated tokens.
 * Accepts commas as the primary separator but also tolerates whitespace and
 * newlines so a pasted column still works. Empty tokens are dropped. Short
 * tokens are left-padded with zeros to three characters, so `48` becomes `048`
 * and `5` becomes `005` (matching the three-character enrollment tail).
 */
export function parsePresentTokens(input: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    const trimmed = raw.trim().toUpperCase();
    if (trimmed.length === 0) {
      continue;
    }
    const token = trimmed.length < 3 ? trimmed.padStart(3, '0') : trimmed;
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

/**
 * Apply a pasted present-list to a roster.
 *
 * A token matches a student when it equals the last three characters of the
 * student's enrollment number (both upper-cased). Matched students become
 * `present`. In `first-time` mode, unmatched students become `absent`; in
 * `correction` mode, unmatched students are left out of the update map so old
 * attendance corrections do not overwrite existing Present/Absent/Leave/NA
 * values. `notFound` collects tokens with zero matches and `ambiguous` collects
 * tokens with more than one match.
 */
export function applyPresentList(
  roster: ReadonlyArray<QuickAttendanceStudent>,
  input: string,
  options: PresentListApplyOptions = {},
): PresentListResult {
  return applyRollList(roster, input, 'present', options);
}

/** Apply a pasted absent-list to a roster with the same matching rules as present-list mode. */
export function applyAbsentList(
  roster: ReadonlyArray<QuickAttendanceStudent>,
  input: string,
  options: PresentListApplyOptions = {},
): PresentListResult {
  return applyRollList(roster, input, 'absent', options);
}

function applyRollList(
  roster: ReadonlyArray<QuickAttendanceStudent>,
  input: string,
  matchedStatus: 'present' | 'absent',
  options: PresentListApplyOptions,
): PresentListResult {
  const mode = options.mode ?? 'correction';
  const tokens = parsePresentTokens(input);

  // Index roster students by their last-three key (a key may map to several ids).
  const idsByKey = new Map<string, string[]>();
  for (const student of roster) {
    if (!student.enrollmentNumber) {
      continue;
    }
    const key = lastThree(student.enrollmentNumber);
    const existing = idsByKey.get(key);
    if (existing) {
      existing.push(student.id);
    } else {
      idsByKey.set(key, [student.id]);
    }
  }

  const matchedIds = new Set<string>();
  const notFound: string[] = [];
  const ambiguous: string[] = [];

  for (const token of tokens) {
    const matches = idsByKey.get(token);
    if (!matches || matches.length === 0) {
      notFound.push(token);
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push(token);
      continue;
    }
    matchedIds.add(matches[0]);
  }

  const statusById: Record<string, AttendanceStatus> = {};
  if (mode === 'first-time') {
    for (const student of roster) {
      statusById[student.id] = matchedIds.has(student.id)
        ? matchedStatus
        : matchedStatus === 'present' ? 'absent' : 'present';
    }
  } else {
    for (const id of matchedIds) {
      statusById[id] = matchedStatus;
    }
  }

  return { statusById, notFound, ambiguous, matchedCount: matchedIds.size };
}
