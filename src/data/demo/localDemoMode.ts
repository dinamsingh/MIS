import type { AttendanceAccess } from '@data/access/attendanceAccess';
import type { MarksAccess, MarkComponentInput, SaveMarkValuesResult } from '@data/access/marksAccess';
import type { QuizAccessRepository, QuizInput, QuestionInput, AttemptSummary } from '@data/access/quizAccess';
import type { SubmitAttemptOutcome } from '@data/access/parsers';
import type { SyllabusAccess, UnitInput, TopicInput } from '@data/access/syllabusAccess';
import type { TimetableAccess, TimetableEntryInput } from '@data/access/timetableAccess';
import type { ParsedRosterRow } from '@domain/services/rosterImportService';
import {
  type AttendanceMark,
  type AttendanceStatusMark,
  type PeriodKey,
  statusFromAttendanceMark,
  statusToAttendanceMark,
} from '@domain/services/attendanceService';
import { computeInternalMarks, validateMarkValue, type MarkComponent, type MarkValue } from '@domain/services/marksService';
import { isValidEnrollmentNumber, type QuizAccess, type QuizPayloadNoAnswers } from '@domain/services/rosterService';
import type { Unit } from '@domain/services/syllabusService';
import { todaysClasses, type DayOfWeek, type TimetableEntry } from '@domain/services/timetableService';
import type { LeaderboardWeights, StudentMetrics } from '@domain/services/leaderboardService';
import type { SubmissionStatus, ValidationError } from '@domain/shared/types';
import { ok, err, type Result } from '@domain/shared/result';

type DemoFlag = '1' | 'true' | 'yes' | 'on';
type DemoOffFlag = '0' | 'false' | 'no' | 'off';

const DEMO_ON: readonly DemoFlag[] = ['1', 'true', 'yes', 'on'];
const DEMO_OFF: readonly DemoOffFlag[] = ['0', 'false', 'no', 'off'];

const STORAGE = {
  attendance: 'mis_demo_attendance_v1',
  marks: 'mis_demo_marks_v1',
  quizzes: 'mis_demo_quizzes_v1',
  syllabus: 'mis_demo_syllabus_v1',
  timetable: 'mis_demo_timetable_v1',
  leaderboard: 'mis_demo_leaderboard_v1',
  analytics: 'mis_demo_analytics_v1',
  assignments: 'mis_demo_assignments_v1',
  materials: 'mis_demo_materials_v1',
  rosterImports: 'mis_demo_roster_imports_v1',
  rosters: 'mis_demo_rosters_v1',
} as const;

export interface DemoStudent {
  readonly id: string;
  readonly name: string;
  readonly enrollmentNumber?: string;
  readonly sectionId?: string;
  readonly sectionName?: string;
}

export interface DemoSubject {
  readonly id: string;
  readonly name: string;
}

export interface DemoAttendanceTrendPoint {
  readonly date: string;
  readonly percent: number;
}

export interface DemoAssignmentItem {
  readonly id: string;
  readonly title: string;
  readonly subjectId: string;
  readonly unitId: string;
  readonly dueDate: string | null;
  readonly shareToken: string;
  readonly fileId: string | null;
  readonly createdAt: string;
}

export interface DemoMaterialItem {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly url: string;
  readonly createdAt: string;
  readonly category: string;
}

export function isLocalDemoMode(): boolean {
  const envValue = String(import.meta.env.VITE_DEMO_MODE ?? '').trim().toLowerCase();
  if ((DEMO_ON as readonly string[]).includes(envValue)) {
    return true;
  }
  if ((DEMO_OFF as readonly string[]).includes(envValue)) {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

export function readDemoValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeDemoValue<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Demo storage is best-effort so private browsing/quota failures never
    // block the teacher from previewing the screen.
  }
}

export function createDemoId(prefix: string): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoApi?.randomUUID) {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function demoNumber(seed: string, min: number, max: number): number {
  const value = hashString(seed) / 0xffffffff;
  return min + value * (max - min);
}

function demoInt(seed: string, min: number, max: number): number {
  return Math.round(demoNumber(seed, min, max));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function offsetDateIso(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return toISODate(date);
}

function periodStorageKey(key: PeriodKey): string {
  return JSON.stringify([key.sectionId, key.subjectId, key.date, key.timeSlot]);
}

function defaultAttendanceMark(key: PeriodKey, studentId: string): boolean {
  return demoNumber(`${key.sectionId}:${key.subjectId}:${key.date}:${key.timeSlot}:${studentId}`, 0, 1) > 0.14;
}

interface DemoAttendanceStore {
  readonly periods: Record<string, AttendanceMark[]>;
  readonly statusPeriods?: Record<string, AttendanceStatusMark[]>;
}

export function createLocalDemoAttendanceAccess(
  loadRoster: (sectionId: string) => Promise<readonly DemoStudent[]>,
): AttendanceAccess {
  async function loadPeriod(key: PeriodKey): Promise<AttendanceMark[]> {
    const store = readDemoValue<DemoAttendanceStore>(STORAGE.attendance, { periods: {} });
    const storageKey = periodStorageKey(key);
    const saved = store.periods[storageKey];
    if (saved) {
      return saved;
    }

    const roster = await loadRoster(key.sectionId);
    return roster.map((student) => ({
      studentId: student.id,
      present: defaultAttendanceMark(key, student.id),
    }));
  }

  return {
    loadPeriod,

    async savePeriod(key, marks) {
      const store = readDemoValue<DemoAttendanceStore>(STORAGE.attendance, { periods: {} });
      writeDemoValue<DemoAttendanceStore>(STORAGE.attendance, {
        ...store,
        periods: {
          ...store.periods,
          [periodStorageKey(key)]: marks.map((mark) => ({ ...mark })),
        },
      });
    },

    async loadStatusPeriod(key) {
      const store = readDemoValue<DemoAttendanceStore>(STORAGE.attendance, { periods: {} });
      const savedStatuses = store.statusPeriods?.[periodStorageKey(key)];
      if (savedStatuses) {
        return savedStatuses;
      }
      const marks = await loadPeriod(key);
      return marks.map(statusFromAttendanceMark);
    },

    async saveStatusPeriod(key, marks) {
      const store = readDemoValue<DemoAttendanceStore>(STORAGE.attendance, { periods: {} });
      writeDemoValue<DemoAttendanceStore>(STORAGE.attendance, {
        periods: {
          ...store.periods,
          [periodStorageKey(key)]: marks
            .map(statusToAttendanceMark)
            .filter((mark): mark is AttendanceMark => mark !== null),
        },
        statusPeriods: {
          ...(store.statusPeriods ?? {}),
          [periodStorageKey(key)]: marks.map((mark) => ({ ...mark })),
        },
      });
    },
  };
}

interface DemoMarksStore {
  readonly componentsBySubject: Record<string, MarkComponent[]>;
  readonly valuesByStudent: Record<string, Record<string, number>>;
  readonly snapshotsByStudent: Record<string, number>;
}

function defaultMarksStore(): DemoMarksStore {
  return { componentsBySubject: {}, valuesByStudent: {}, snapshotsByStudent: {} };
}

function defaultComponents(subjectId: string): MarkComponent[] {
  return [
    { id: `demo-${subjectId}-mid`, name: 'Mid Term', maxValue: 50, weightage: 30 },
    { id: `demo-${subjectId}-quiz`, name: 'Quiz', maxValue: 20, weightage: 20 },
    { id: `demo-${subjectId}-assignment`, name: 'Assignment', maxValue: 30, weightage: 20 },
    { id: `demo-${subjectId}-end`, name: 'End Term', maxValue: 100, weightage: 30 },
  ];
}

function readMarksStore(): DemoMarksStore {
  return readDemoValue<DemoMarksStore>(STORAGE.marks, defaultMarksStore());
}

function writeMarksStore(store: DemoMarksStore): void {
  writeDemoValue(STORAGE.marks, store);
}

function valuesForComponents(studentId: string, components: readonly MarkComponent[]): MarkValue[] {
  const store = readMarksStore();
  const saved = store.valuesByStudent[studentId] ?? {};
  return components.map((component) => {
    const savedValue = saved[component.id];
    const value =
      savedValue ??
      round1(component.maxValue * demoNumber(`${studentId}:${component.id}:marks`, 0.58, 0.94));
    return { componentId: component.id, value };
  });
}

export function createLocalDemoMarksAccess(): MarksAccess {
  let activeComponents: MarkComponent[] = [];

  return {
    async listComponents(subjectId) {
      const store = readMarksStore();
      const components = store.componentsBySubject[subjectId] ?? defaultComponents(subjectId);
      if (!store.componentsBySubject[subjectId]) {
        writeMarksStore({
          ...store,
          componentsBySubject: { ...store.componentsBySubject, [subjectId]: components },
        });
      }
      activeComponents = components;
      return components;
    },

    async upsertComponent(input: MarkComponentInput) {
      const store = readMarksStore();
      const components = store.componentsBySubject[input.subjectId] ?? defaultComponents(input.subjectId);
      const id = input.id ?? createDemoId('mark-component');
      const saved: MarkComponent = {
        id,
        name: input.name,
        maxValue: input.maxValue,
        weightage: input.weightage,
      };
      const existingIndex = components.findIndex((component) => component.id === id);
      const nextComponents =
        existingIndex === -1
          ? [...components, saved]
          : components.map((component) => (component.id === id ? saved : component));
      writeMarksStore({
        ...store,
        componentsBySubject: { ...store.componentsBySubject, [input.subjectId]: nextComponents },
      });
      activeComponents = nextComponents;
      return id;
    },

    async deleteComponent(componentId) {
      const store = readMarksStore();
      const componentsBySubject = Object.fromEntries(
        Object.entries(store.componentsBySubject).map(([subjectId, components]) => [
          subjectId,
          components.filter((component) => component.id !== componentId),
        ]),
      );
      const valuesByStudent = Object.fromEntries(
        Object.entries(store.valuesByStudent).map(([studentId, values]) => {
          const { [componentId]: _removed, ...rest } = values;
          return [studentId, rest];
        }),
      );
      writeMarksStore({ ...store, componentsBySubject, valuesByStudent });
      activeComponents = activeComponents.filter((component) => component.id !== componentId);
    },

    async loadValues(studentId) {
      return valuesForComponents(studentId, activeComponents);
    },

    async saveValues(
      studentId: string,
      components: MarkComponent[],
      values: MarkValue[],
    ): Promise<Result<SaveMarkValuesResult, ValidationError>> {
      const componentById = new Map(components.map((component) => [component.id, component]));
      for (const value of values) {
        const component = componentById.get(value.componentId);
        if (!component) {
          continue;
        }
        const validated = validateMarkValue(value.value, component);
        if (!validated.ok) {
          return err(validated.error);
        }
      }

      const internalMarks = computeInternalMarks(components, values);
      const store = readMarksStore();
      const previousValues = store.valuesByStudent[studentId] ?? {};
      const nextValues = values.reduce<Record<string, number>>(
        (acc, value) => ({ ...acc, [value.componentId]: value.value }),
        previousValues,
      );
      writeMarksStore({
        ...store,
        valuesByStudent: { ...store.valuesByStudent, [studentId]: nextValues },
        snapshotsByStudent: { ...store.snapshotsByStudent, [studentId]: internalMarks },
      });
      return ok({ internalMarks });
    },
  };
}

export function demoInternalMarksForStudent(studentId: string): number {
  const store = readMarksStore();
  return round1(store.snapshotsByStudent[studentId] ?? demoNumber(`${studentId}:internal`, 56, 92));
}

interface DemoQuizQuestion extends QuestionInput {
  readonly id: string;
}

interface DemoQuizRecord {
  readonly id: string;
  readonly unitId: string;
  readonly title: string;
  readonly timeLimitMinutes: number;
  readonly shareToken: string;
  readonly questions: DemoQuizQuestion[];
}

interface DemoQuizStore {
  readonly quizzes: Record<string, DemoQuizRecord>;
  readonly attemptsByQuiz: Record<string, AttemptSummary[]>;
}

function defaultQuizStore(): DemoQuizStore {
  return { quizzes: {}, attemptsByQuiz: {} };
}

function readQuizStore(): DemoQuizStore {
  return readDemoValue<DemoQuizStore>(STORAGE.quizzes, defaultQuizStore());
}

function writeQuizStore(store: DemoQuizStore): void {
  writeDemoValue(STORAGE.quizzes, store);
}

function findQuiz(store: DemoQuizStore, quizIdOrToken: string): DemoQuizRecord | null {
  return (
    store.quizzes[quizIdOrToken] ??
    Object.values(store.quizzes).find((quiz) => quiz.shareToken === quizIdOrToken) ??
    null
  );
}

function quizPayload(quiz: DemoQuizRecord): QuizPayloadNoAnswers {
  return {
    id: quiz.id,
    unitId: quiz.unitId,
    timeLimitMinutes: quiz.timeLimitMinutes,
    shareToken: quiz.shareToken,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      text: question.text,
      options: question.options,
    })),
  };
}

function totalQuizMarks(quiz: DemoQuizRecord): number {
  return quiz.questions.reduce((sum, question) => sum + (question.marks ?? 1), 0);
}

export function createLocalDemoQuizAccess(
  getStudents: () => readonly DemoStudent[] = () => [],
): QuizAccessRepository {
  return {
    async createQuiz(input: QuizInput) {
      const store = readQuizStore();
      const id = createDemoId('quiz');
      const quiz: DemoQuizRecord = {
        id,
        unitId: input.unitId,
        title: input.title,
        timeLimitMinutes: input.timeLimitMinutes ?? 15,
        shareToken: input.shareToken,
        questions: [],
      };
      writeQuizStore({ ...store, quizzes: { ...store.quizzes, [id]: quiz } });
      return id;
    },

    async addQuestion(quizId: string, question: QuestionInput) {
      const store = readQuizStore();
      const quiz = store.quizzes[quizId];
      if (!quiz) {
        return '';
      }
      const id = createDemoId('question');
      const nextQuiz: DemoQuizRecord = {
        ...quiz,
        questions: [...quiz.questions, { ...question, id }],
      };
      writeQuizStore({ ...store, quizzes: { ...store.quizzes, [quizId]: nextQuiz } });
      return id;
    },

    async resolveAccess(quizId: string, providedEnrollment: string | null): Promise<QuizAccess> {
      const quiz = findQuiz(readQuizStore(), quizId);
      if (!quiz) {
        return { status: 'denied', reason: 'not-registered' };
      }
      if (providedEnrollment === null) {
        return { status: 'enrollment-required' };
      }
      if (!isValidEnrollmentNumber(providedEnrollment.trim().toUpperCase())) {
        return { status: 'denied', reason: 'not-registered' };
      }
      return { status: 'granted', quiz: quizPayload(quiz) };
    },

    async submitAttempt(quizId: string, answers: Record<string, number>): Promise<SubmitAttemptOutcome> {
      const store = readQuizStore();
      const quiz = findQuiz(store, quizId);
      if (!quiz) {
        return { status: 'denied', reason: 'not-registered' };
      }

      const totalMarks = totalQuizMarks(quiz);
      const score = quiz.questions.reduce((sum, question) => {
        return answers[question.id] === question.correctIndex ? sum + (question.marks ?? 1) : sum;
      }, 0);
      const attempt = { studentId: 'demo-student', score };
      writeQuizStore({
        ...store,
        attemptsByQuiz: {
          ...store.attemptsByQuiz,
          [quiz.id]: [attempt, ...(store.attemptsByQuiz[quiz.id] ?? []).filter((row) => row.studentId !== attempt.studentId)],
        },
      });
      return { status: 'recorded', result: { score, totalMarks } };
    },

    async listAttempts(quizId: string) {
      const store = readQuizStore();
      const quiz = findQuiz(store, quizId);
      if (!quiz) {
        return [];
      }

      const saved = store.attemptsByQuiz[quiz.id];
      if (saved && saved.length > 0) {
        return saved;
      }

      const maxScore = Math.max(totalQuizMarks(quiz), quiz.questions.length || 10);
      return getStudents()
        .filter((student) => demoNumber(`${quiz.id}:${student.id}:attempted`, 0, 1) > 0.22)
        .map((student) => ({
          studentId: student.id,
          score: demoInt(`${quiz.id}:${student.id}:score`, Math.ceil(maxScore * 0.45), maxScore),
        }));
    },
  };
}

interface DemoSyllabusStore {
  readonly unitsBySubject: Record<string, Unit[]>;
}

function defaultUnits(subjectId: string): Unit[] {
  return [
    {
      id: `demo-${subjectId}-unit-1`,
      name: 'Unit 1: Foundations',
      plannedDate: offsetDateIso(-35),
      topics: [
        { id: `demo-${subjectId}-topic-1`, name: 'Core concepts', complete: true },
        { id: `demo-${subjectId}-topic-2`, name: 'Terminology and examples', complete: true },
        { id: `demo-${subjectId}-topic-3`, name: 'Practice problems', complete: true },
      ],
    },
    {
      id: `demo-${subjectId}-unit-2`,
      name: 'Unit 2: Applied Work',
      plannedDate: offsetDateIso(-7),
      topics: [
        { id: `demo-${subjectId}-topic-4`, name: 'Case study walkthrough', complete: true },
        { id: `demo-${subjectId}-topic-5`, name: 'Lab exercise', complete: false },
      ],
    },
    {
      id: `demo-${subjectId}-unit-3`,
      name: 'Unit 3: Revision',
      plannedDate: offsetDateIso(18),
      topics: [
        { id: `demo-${subjectId}-topic-6`, name: 'Previous year questions', complete: false },
        { id: `demo-${subjectId}-topic-7`, name: 'Mock assessment', complete: false },
      ],
    },
  ];
}

function readSyllabusStore(): DemoSyllabusStore {
  return readDemoValue<DemoSyllabusStore>(STORAGE.syllabus, { unitsBySubject: {} });
}

function writeSyllabusStore(store: DemoSyllabusStore): void {
  writeDemoValue(STORAGE.syllabus, store);
}

export function createLocalDemoSyllabusAccess(): SyllabusAccess {
  return {
    async listUnits(subjectId) {
      const store = readSyllabusStore();
      const units = store.unitsBySubject[subjectId] ?? defaultUnits(subjectId);
      if (!store.unitsBySubject[subjectId]) {
        writeSyllabusStore({ unitsBySubject: { ...store.unitsBySubject, [subjectId]: units } });
      }
      return units;
    },

    async upsertUnit(input: UnitInput) {
      const store = readSyllabusStore();
      const units = store.unitsBySubject[input.subjectId] ?? defaultUnits(input.subjectId);
      const id = input.id ?? createDemoId('unit');
      const existing = units.find((unit) => unit.id === id);
      const saved: Unit = {
        id,
        name: input.name,
        topics: existing?.topics ?? [],
        ...(input.plannedDate ? { plannedDate: input.plannedDate } : {}),
      };
      const nextUnits = existing
        ? units.map((unit) => (unit.id === id ? saved : unit))
        : [...units, saved];
      writeSyllabusStore({
        unitsBySubject: { ...store.unitsBySubject, [input.subjectId]: nextUnits },
      });
      return id;
    },

    async deleteUnit(unitId) {
      const store = readSyllabusStore();
      writeSyllabusStore({
        unitsBySubject: Object.fromEntries(
          Object.entries(store.unitsBySubject).map(([subjectId, units]) => [
            subjectId,
            units.filter((unit) => unit.id !== unitId),
          ]),
        ),
      });
    },

    async upsertTopic(input: TopicInput) {
      const store = readSyllabusStore();
      let savedId = input.id ?? createDemoId('topic');
      const unitsBySubject = Object.fromEntries(
        Object.entries(store.unitsBySubject).map(([subjectId, units]) => [
          subjectId,
          units.map((unit) => {
            if (unit.id !== input.unitId) {
              return unit;
            }
            savedId = input.id ?? savedId;
            const topic = {
              id: savedId,
              name: input.name,
              complete: input.complete ?? false,
            };
            const exists = unit.topics.some((item) => item.id === savedId);
            return {
              ...unit,
              topics: exists
                ? unit.topics.map((item) => (item.id === savedId ? topic : item))
                : [...unit.topics, topic],
            };
          }),
        ]),
      );
      writeSyllabusStore({ unitsBySubject });
      return savedId;
    },

    async deleteTopic(topicId) {
      const store = readSyllabusStore();
      writeSyllabusStore({
        unitsBySubject: Object.fromEntries(
          Object.entries(store.unitsBySubject).map(([subjectId, units]) => [
            subjectId,
            units.map((unit) => ({
              ...unit,
              topics: unit.topics.filter((topic) => topic.id !== topicId),
            })),
          ]),
        ),
      });
    },

    async setTopicComplete(topicId, complete) {
      const store = readSyllabusStore();
      writeSyllabusStore({
        unitsBySubject: Object.fromEntries(
          Object.entries(store.unitsBySubject).map(([subjectId, units]) => [
            subjectId,
            units.map((unit) => ({
              ...unit,
              topics: unit.topics.map((topic) =>
                topic.id === topicId ? { ...topic, complete } : topic,
              ),
            })),
          ]),
        ),
      });
    },
  };
}

interface DemoTimetableStore {
  readonly entriesBySection: Record<string, TimetableEntry[]>;
}

const DEMO_DAYS: readonly DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DEMO_SLOTS = ['09:00-10:00', '10:00-11:00', '11:00-12:00', '14:00-15:00'] as const;

async function resolveSubjects(
  getSubjects: (sectionId: string) => Promise<readonly DemoSubject[]> | readonly DemoSubject[],
  sectionId: string,
): Promise<readonly DemoSubject[]> {
  return Promise.resolve(getSubjects(sectionId));
}

function fallbackSubjects(sectionId: string): DemoSubject[] {
  return [
    { id: `demo-${sectionId}-subject-1`, name: 'Data Structures' },
    { id: `demo-${sectionId}-subject-2`, name: 'Operating Systems' },
    { id: `demo-${sectionId}-subject-3`, name: 'Database Systems' },
  ];
}

function buildTimetableEntries(sectionId: string, subjects: readonly DemoSubject[]): TimetableEntry[] {
  const availableSubjects = subjects.length > 0 ? subjects : fallbackSubjects(sectionId);
  return DEMO_DAYS.flatMap((day, dayIndex) =>
    DEMO_SLOTS.slice(0, dayIndex === 4 ? 3 : 4).map((timeSlot, slotIndex) => {
      const subject = availableSubjects[(dayIndex + slotIndex) % availableSubjects.length];
      return {
        id: `demo-${sectionId}-${day}-${slotIndex}`,
        sectionId,
        subjectId: subject.id,
        dayOfWeek: day,
        timeSlot,
      };
    }),
  );
}

export function createLocalDemoTimetableAccess(
  getSubjects: (sectionId: string) => Promise<readonly DemoSubject[]> | readonly DemoSubject[],
): TimetableAccess {
  async function listEntries(sectionId: string): Promise<TimetableEntry[]> {
    const store = readDemoValue<DemoTimetableStore>(STORAGE.timetable, { entriesBySection: {} });
    const saved = store.entriesBySection[sectionId];
    if (saved) {
      return saved;
    }
    const entries = buildTimetableEntries(sectionId, await resolveSubjects(getSubjects, sectionId));
    writeDemoValue<DemoTimetableStore>(STORAGE.timetable, {
      entriesBySection: { ...store.entriesBySection, [sectionId]: entries },
    });
    return entries;
  }

  return {
    listEntries,

    async upsertEntry(input: TimetableEntryInput) {
      const store = readDemoValue<DemoTimetableStore>(STORAGE.timetable, { entriesBySection: {} });
      const current = store.entriesBySection[input.sectionId] ?? [];
      const id = input.id ?? createDemoId('timetable');
      const saved: TimetableEntry = { ...input, id };
      const next = current.some((entry) => entry.id === id)
        ? current.map((entry) => (entry.id === id ? saved : entry))
        : [...current, saved];
      writeDemoValue<DemoTimetableStore>(STORAGE.timetable, {
        entriesBySection: { ...store.entriesBySection, [input.sectionId]: next },
      });
      return id;
    },

    async deleteEntry(entryId) {
      const store = readDemoValue<DemoTimetableStore>(STORAGE.timetable, { entriesBySection: {} });
      writeDemoValue<DemoTimetableStore>(STORAGE.timetable, {
        entriesBySection: Object.fromEntries(
          Object.entries(store.entriesBySection).map(([sectionId, entries]) => [
            sectionId,
            entries.filter((entry) => entry.id !== entryId),
          ]),
        ),
      });
    },

    async todaysClasses(sectionId, day) {
      return todaysClasses(await listEntries(sectionId), day);
    },

    async listSectionIdsForSubject(subjectId) {
      const store = readDemoValue<DemoTimetableStore>(STORAGE.timetable, { entriesBySection: {} });
      const sectionIds = new Set<string>();
      for (const [sectionId, entries] of Object.entries(store.entriesBySection)) {
        if (entries.some((entry) => entry.subjectId === subjectId)) {
          sectionIds.add(sectionId);
        }
      }
      return Array.from(sectionIds);
    },
  };
}

export function buildDemoStudentMetrics(
  students: readonly DemoStudent[],
  sectionName?: string,
): StudentMetrics[] {
  return students.map((student) => ({
    studentId: student.id,
    name: student.name,
    internalMarks: demoInternalMarksForStudent(student.id),
    quizScore: round1(demoNumber(`${student.id}:quiz`, 52, 96)),
    attendancePercent: round1(demoNumber(`${student.id}:attendance`, 64, 98)),
    enrollmentNumber: student.enrollmentNumber,
    sectionName: student.sectionName ?? sectionName,
  }));
}

export function buildDemoAttendanceTrend(sectionId: string, days = 42): DemoAttendanceTrendPoint[] {
  return Array.from({ length: days }, (_, index) => {
    const offset = index - (days - 1);
    const date = offsetDateIso(offset);
    const wave = Math.sin(index / 4) * 5;
    const percent = clamp(demoNumber(`${sectionId}:${date}:trend`, 72, 94) + wave, 55, 99);
    return { date, percent: round1(percent) };
  });
}

export function defaultDemoWeights(): LeaderboardWeights {
  return { internalMarks: 0.4, quizScores: 0.25, attendance: 0.35 };
}

export interface DemoLeaderboardConfig {
  readonly enabled: boolean;
  readonly weights: LeaderboardWeights;
}

export function loadDemoLeaderboardConfig(): DemoLeaderboardConfig {
  return readDemoValue<DemoLeaderboardConfig>(STORAGE.leaderboard, {
    enabled: true,
    weights: defaultDemoWeights(),
  });
}

export function saveDemoLeaderboardConfig(config: DemoLeaderboardConfig): void {
  writeDemoValue(STORAGE.leaderboard, config);
}

export function loadDemoAnalyticsThreshold(): number {
  return readDemoValue<{ threshold: number }>(STORAGE.analytics, { threshold: 60 }).threshold;
}

export function saveDemoAnalyticsThreshold(threshold: number): void {
  writeDemoValue(STORAGE.analytics, { threshold });
}

interface DemoAssignmentStore {
  readonly items: DemoAssignmentItem[];
  readonly assignmentSubmissions: Record<string, SubmissionStatus>;
  readonly labManualSubmissions: Record<string, SubmissionStatus>;
}

function readAssignmentStore(): DemoAssignmentStore {
  return readDemoValue<DemoAssignmentStore>(STORAGE.assignments, {
    items: [],
    assignmentSubmissions: {},
    labManualSubmissions: {},
  });
}

function writeAssignmentStore(store: DemoAssignmentStore): void {
  writeDemoValue(STORAGE.assignments, store);
}

export function listDemoAssignments(subjectIds: readonly string[]): DemoAssignmentItem[] {
  const store = readAssignmentStore();
  return store.items
    .filter((item) => subjectIds.length === 0 || subjectIds.includes(item.subjectId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createDemoAssignment(input: {
  readonly title: string;
  readonly subjectId: string;
  readonly unitId: string;
  readonly dueDate: string | null;
  readonly fileId: string | null;
  readonly shareToken: string;
}): string {
  const store = readAssignmentStore();
  const id = createDemoId('assignment');
  const item: DemoAssignmentItem = { ...input, id, createdAt: new Date().toISOString() };
  writeAssignmentStore({ ...store, items: [item, ...store.items] });
  return id;
}

function assignmentSubmissionKey(assignmentId: string, studentId: string, unitId: string): string {
  return JSON.stringify([assignmentId, studentId, unitId]);
}

function labSubmissionKey(studentId: string, unitId: string): string {
  return JSON.stringify([studentId, unitId]);
}

export function getDemoAssignmentSubmission(
  assignmentId: string,
  studentId: string,
  unitId: string,
): SubmissionStatus {
  const store = readAssignmentStore();
  return (
    store.assignmentSubmissions[assignmentSubmissionKey(assignmentId, studentId, unitId)] ??
    (demoNumber(`${assignmentId}:${studentId}:${unitId}:assignment`, 0, 1) > 0.32 ? 'submitted' : 'not-submitted')
  );
}

export function setDemoAssignmentSubmission(
  assignmentId: string,
  studentId: string,
  unitId: string,
  status: SubmissionStatus,
): void {
  const store = readAssignmentStore();
  writeAssignmentStore({
    ...store,
    assignmentSubmissions: {
      ...store.assignmentSubmissions,
      [assignmentSubmissionKey(assignmentId, studentId, unitId)]: status,
    },
  });
}

export function getDemoLabManualSubmission(studentId: string, unitId: string): SubmissionStatus {
  const store = readAssignmentStore();
  return (
    store.labManualSubmissions[labSubmissionKey(studentId, unitId)] ??
    (demoNumber(`${studentId}:${unitId}:lab`, 0, 1) > 0.4 ? 'submitted' : 'not-submitted')
  );
}

export function setDemoLabManualSubmission(
  studentId: string,
  unitId: string,
  status: SubmissionStatus,
): void {
  const store = readAssignmentStore();
  writeAssignmentStore({
    ...store,
    labManualSubmissions: {
      ...store.labManualSubmissions,
      [labSubmissionKey(studentId, unitId)]: status,
    },
  });
}

export function listDemoMaterials(category: string): DemoMaterialItem[] {
  return readDemoValue<DemoMaterialItem[]>(STORAGE.materials, [])
    .filter((item) => item.category === category)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createDemoMaterial(input: {
  readonly category: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}): DemoMaterialItem {
  const materials = readDemoValue<DemoMaterialItem[]>(STORAGE.materials, []);
  const id = createDemoId('material');
  const item: DemoMaterialItem = {
    ...input,
    id,
    url: `demo-local://${id}/${encodeURIComponent(input.fileName)}`,
    createdAt: new Date().toISOString(),
  };
  writeDemoValue(STORAGE.materials, [item, ...materials]);
  return item;
}

export function recordDemoRosterImport(sectionId: string, imported: number): void {
  const imports = readDemoValue<Array<{ sectionId: string; imported: number; createdAt: string }>>(
    STORAGE.rosterImports,
    [],
  );
  writeDemoValue(STORAGE.rosterImports, [
    { sectionId, imported, createdAt: new Date().toISOString() },
    ...imports,
  ]);
}

export function replaceDemoRoster(
  sectionId: string,
  rows: readonly ParsedRosterRow[],
): { deleted: number; imported: number } {
  const rosters = readDemoValue<Record<string, DemoStudent[]>>(STORAGE.rosters, {});
  const existing = rosters[sectionId] ?? [];
  const next = rows.map((row) => ({
    id: `demo-student-${sectionId}-${row.enrollmentNumber}`,
    name: row.name,
    enrollmentNumber: row.enrollmentNumber,
    sectionId,
  }));

  writeDemoValue(STORAGE.rosters, {
    ...rosters,
    [sectionId]: next,
  });
  recordDemoRosterImport(sectionId, rows.length);

  return { deleted: existing.length, imported: rows.length };
}

export function listDemoRoster(sectionId: string): DemoStudent[] {
  const rosters = readDemoValue<Record<string, DemoStudent[]>>(STORAGE.rosters, {});
  return rosters[sectionId] ?? [];
}
