/**
 * Marks data-access wrapper (task 16.2).
 *
 * Binds the pure `marksService` to the `mark_components` and `mark_values`
 * tables: components CRUD is parameterized writes (Requirements 7.1, 7.2),
 * per-student values are validated against their component bounds before
 * persistence (Requirement 7.5 — pure `validateMarkValue`), and saving values
 * also persists the computed Internal_Marks snapshot (Requirement 7.6 —
 * reusing pure `computeInternalMarks`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from '../supabase';
import {
  validateMarkValue,
  computeInternalMarks,
  type MarkComponent,
  type MarkValue,
} from '../../domain/services/marksService';
import { type Result, ok, err } from '../../domain/shared/result';
import type { ValidationError } from '../../domain/shared/types';
import {
  toMarkComponent,
  toMarkValue,
  type MarkComponentRow,
  type MarkValueRow,
} from './rows';
import { expectOk, unwrap, unwrapList } from './support';

export { validateMarkValue, computeInternalMarks };

/** Fields accepted when creating or editing a mark component. */
export interface MarkComponentInput {
  readonly id?: string;
  readonly subjectId: string;
  readonly name: string;
  readonly maxValue: number;
  readonly weightage: number;
}

/** The result of saving a student's mark values: the persisted internal total. */
export interface SaveMarkValuesResult {
  readonly internalMarks: number;
}

/** Supabase-backed marks operations. */
export interface MarksAccess {
  /** List the mark components configured for a subject (Requirement 7.1). */
  listComponents(subjectId: string): Promise<MarkComponent[]>;
  /** Create or update a mark component, returning its id (Requirement 7.2). */
  upsertComponent(input: MarkComponentInput): Promise<string>;
  /** Delete a mark component. */
  deleteComponent(componentId: string): Promise<void>;
  /** Load a student's saved mark values. */
  loadValues(studentId: string): Promise<MarkValue[]>;
  /**
   * Validate, then persist a student's mark values together with the computed
   * Internal_Marks snapshot (Requirements 7.5, 7.6). Rejects before any write
   * when a value is out of its component's range.
   */
  saveValues(
    studentId: string,
    components: MarkComponent[],
    values: MarkValue[],
  ): Promise<Result<SaveMarkValuesResult, ValidationError>>;
}

interface InsertedId {
  readonly id: string;
}

/** Create a {@link MarksAccess} bound to the given Supabase client. */
export function createMarksAccess(client: SupabaseClient = defaultClient): MarksAccess {
  return {
    async listComponents(subjectId: string): Promise<MarkComponent[]> {
      const rows = unwrapList(
        await client
          .from('mark_components')
          .select('id, subject_id, name, max_value, weightage')
          .eq('subject_id', subjectId)
          .order('name', { ascending: true }),
      ) as MarkComponentRow[];
      return rows.map(toMarkComponent);
    },

    async upsertComponent(input: MarkComponentInput): Promise<string> {
      const row = {
        ...(input.id !== undefined ? { id: input.id } : {}),
        subject_id: input.subjectId,
        name: input.name,
        max_value: input.maxValue,
        weightage: input.weightage,
      };
      const inserted = unwrap(
        await client.from('mark_components').upsert(row).select('id').single(),
      ) as InsertedId | null;
      return inserted?.id ?? input.id ?? '';
    },

    async deleteComponent(componentId: string): Promise<void> {
      expectOk(await client.from('mark_components').delete().eq('id', componentId));
    },

    async loadValues(studentId: string): Promise<MarkValue[]> {
      const rows = unwrapList(
        await client
          .from('mark_values')
          .select('student_id, component_id, value')
          .eq('student_id', studentId),
      ) as MarkValueRow[];
      return rows.map(toMarkValue);
    },

    async saveValues(
      studentId: string,
      components: MarkComponent[],
      values: MarkValue[],
    ): Promise<Result<SaveMarkValuesResult, ValidationError>> {
      const componentById = new Map(components.map((c) => [c.id, c]));

      // Validate every value against its component bounds before any write
      // (Requirement 7.5). Values for unknown components are ignored.
      for (const value of values) {
        const component = componentById.get(value.componentId);
        if (component === undefined) {
          continue;
        }
        const validated = validateMarkValue(value.value, component);
        if (!validated.ok) {
          return err(validated.error);
        }
      }

      const internalMarks = computeInternalMarks(components, values);

      const rows = values
        .filter((value) => componentById.has(value.componentId))
        .map((value) => ({
          student_id: studentId,
          component_id: value.componentId,
          value: value.value,
          internal_marks_snapshot: internalMarks,
        }));

      if (rows.length > 0) {
        expectOk(
          await client
            .from('mark_values')
            .upsert(rows, { onConflict: 'student_id,component_id' }),
        );
      }

      return ok({ internalMarks });
    },
  };
}
