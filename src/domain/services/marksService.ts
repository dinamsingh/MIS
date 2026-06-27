/**
 * Marks domain service (`marksService`).
 *
 * Pure functions backing the Marks_Calculator: validating teacher-entered
 * mark-component values against their configured bounds, and computing a
 * student's Internal_Marks as a deterministic weighted total of the
 * teacher-defined components.
 *
 * These functions hold no state and perform no I/O; persistence and audit
 * logging are handled by the data-access layer and database triggers.
 *
 * _Requirements: 7.3, 7.4, 7.5_
 */
import { type Result, ok, err } from '../shared/result';
import type { ValidationError } from '../shared/types';
import { messages } from '../shared/messages';

/**
 * A teacher-defined internal-marks component (Requirement 7.1), with its own
 * maximum attainable value and the weightage it contributes to the total.
 */
export interface MarkComponent {
  readonly id: string;
  readonly name: string;
  readonly maxValue: number;
  readonly weightage: number;
}

/** A per-student value entered for a specific mark component (Requirement 7.3). */
export interface MarkValue {
  readonly componentId: string;
  readonly value: number;
}

/**
 * Validate a single mark-component value against its component's configured
 * bounds (Requirement 7.5): the value is accepted if and only if it is a
 * finite number greater than or equal to zero and less than or equal to the
 * component's configured maximum. Otherwise it is rejected with an English
 * validation message sourced from the centralized catalog.
 *
 * @returns `ok(value)` when in range; `err(ValidationError)` otherwise.
 */
export function validateMarkValue(
  value: number,
  component: MarkComponent,
): Result<number, ValidationError> {
  const inRange =
    Number.isFinite(value) && value >= 0 && value <= component.maxValue;

  if (!inRange) {
    return err({
      code: 'mark-value-out-of-range',
      message: messages.validation.markValueOutOfRange(component.maxValue),
      field: component.id,
    });
  }

  return ok(value);
}

/**
 * Compute a student's Internal_Marks as the deterministic weighted total of
 * the teacher-defined components (Requirement 7.4).
 *
 * Each component contributes `(value / maxValue) * weightage`, so a value at
 * the component maximum contributes the component's full weightage and a value
 * of zero contributes nothing. The result therefore lies within
 * `[0, sum of weightages]` and is non-decreasing as any individual value
 * increases.
 *
 * Values are matched to components by `componentId`. A component without a
 * supplied value (or whose value is out of range / non-finite) contributes
 * zero, and a component whose `maxValue` is not positive contributes zero
 * (avoiding division by zero). Supplied values for unknown components are
 * ignored. The computation is order-independent and deterministic.
 */
export function computeInternalMarks(
  components: MarkComponent[],
  values: MarkValue[],
): number {
  const valueByComponent = new Map<string, number>();
  for (const { componentId, value } of values) {
    valueByComponent.set(componentId, value);
  }

  let total = 0;
  for (const component of components) {
    if (!(component.maxValue > 0) || !(component.weightage > 0)) {
      continue;
    }

    const raw = valueByComponent.get(component.id);
    if (raw === undefined || !Number.isFinite(raw) || raw <= 0) {
      continue;
    }

    const clamped = Math.min(raw, component.maxValue);
    total += (clamped / component.maxValue) * component.weightage;
  }

  return total;
}
