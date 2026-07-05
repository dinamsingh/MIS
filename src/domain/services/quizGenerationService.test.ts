import { describe, it, expect } from 'vitest';
import {
  buildQuizPrompt,
  clampQuestionCount,
  normalizeDifficulty,
  parseGeneratedQuestions,
  extractJson,
  MIN_QUESTIONS,
  MAX_QUESTIONS,
} from './quizGenerationService';

describe('clampQuestionCount', () => {
  it('clamps into [MIN, MAX] and floors', () => {
    expect(clampQuestionCount(0)).toBe(MIN_QUESTIONS);
    expect(clampQuestionCount(999)).toBe(MAX_QUESTIONS);
    expect(clampQuestionCount(5.9)).toBe(5);
    expect(clampQuestionCount(Number.NaN)).toBe(MIN_QUESTIONS);
  });
});

describe('normalizeDifficulty', () => {
  it('accepts known values, defaults to mixed', () => {
    expect(normalizeDifficulty('easy')).toBe('easy');
    expect(normalizeDifficulty('HARD')).toBe('hard');
    expect(normalizeDifficulty('weird')).toBe('mixed');
    expect(normalizeDifficulty(null)).toBe('mixed');
  });
});

describe('buildQuizPrompt', () => {
  it('includes subject, unit, topics and the requested count', () => {
    const prompt = buildQuizPrompt({
      subjectName: 'Operating Systems',
      unitName: 'CPU Scheduling',
      topics: ['FCFS', 'Round Robin'],
      numQuestions: 3,
      difficulty: 'hard',
    });
    expect(prompt).toContain('Operating Systems');
    expect(prompt).toContain('CPU Scheduling');
    expect(prompt).toContain('- FCFS');
    expect(prompt).toContain('exactly 3');
    expect(prompt.toLowerCase()).toContain('hard');
    expect(prompt).toContain('"questions"');
  });
});

describe('parseGeneratedQuestions', () => {
  it('keeps well-formed questions and drops malformed ones', () => {
    const raw = {
      questions: [
        { text: 'Q1', options: ['a', 'b', 'c', 'd'], correctIndex: 2, marks: 1 },
        { text: '', options: ['a', 'b', 'c', 'd'], correctIndex: 0 }, // empty text
        { text: 'Q3', options: ['a', 'b', 'c'], correctIndex: 0 }, // only 3 options
        { text: 'Q4', options: ['a', 'b', 'c', 'd'], correctIndex: 9 }, // bad index
        { text: 'Q5', options: ['a', 'b', 'c', 'd'], correctIndex: 1 }, // marks defaults to 1
      ],
    };
    const { questions, rejected } = parseGeneratedQuestions(raw);
    expect(questions).toHaveLength(2);
    expect(rejected).toBe(3);
    expect(questions[0]).toEqual({ text: 'Q1', options: ['a', 'b', 'c', 'd'], correctIndex: 2, marks: 1 });
    expect(questions[1].marks).toBe(1);
  });

  it('accepts a bare array too', () => {
    const { questions } = parseGeneratedQuestions([
      { text: 'Q', options: ['1', '2', '3', '4'], correctIndex: 0, marks: 2 },
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].marks).toBe(2);
  });

  it('returns empty on non-object/array input', () => {
    expect(parseGeneratedQuestions(null).questions).toHaveLength(0);
    expect(parseGeneratedQuestions('nope').questions).toHaveLength(0);
  });
});

describe('extractJson', () => {
  it('parses fenced json', () => {
    const out = extractJson('```json\n{"questions":[]}\n```');
    expect(out).toEqual({ questions: [] });
  });

  it('parses json embedded in prose', () => {
    const out = extractJson('Here you go: {"questions":[{"text":"x"}]} thanks');
    expect(out).toEqual({ questions: [{ text: 'x' }] });
  });

  it('returns null when nothing parseable', () => {
    expect(extractJson('no json here')).toBeNull();
  });
});
