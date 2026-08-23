import { describe, it, expect } from 'vitest';
import { canSendNudge } from '../src/domain/nudge';
import type { NudgeInput } from '../src/types';

describe('canSendNudge', () => {
  const baseInput: NudgeInput = {
    type: 'deadline_approaching',
    now: '2026-03-15T12:00:00Z',
    history: [],
    minGapHours: 24,
    maxPerWeek: 3,
  };

  it('allows first nudge (empty history)', () => {
    expect(canSendNudge(baseInput)).toBe(true);
  });

  it('blocks if minGap not elapsed since last nudge', () => {
    const input: NudgeInput = {
      ...baseInput,
      history: [
        { type: 'deadline_approaching', sentAt: '2026-03-14T13:00:00Z' }, // 23 hours ago
      ],
    };
    expect(canSendNudge(input)).toBe(false);
  });

  it('allows if minGap has elapsed since last nudge', () => {
    const input: NudgeInput = {
      ...baseInput,
      history: [
        { type: 'deadline_approaching', sentAt: '2026-03-14T11:00:00Z' }, // 25 hours ago
      ],
    };
    expect(canSendNudge(input)).toBe(true);
  });

  it('blocks if maxPerWeek reached within last 7 days', () => {
    const input: NudgeInput = {
      ...baseInput,
      history: [
        { type: 'deadline_approaching', sentAt: '2026-03-08T12:00:00Z' }, // 7 days ago
        { type: 'date_locked', sentAt: '2026-03-09T12:00:00Z' },
        { type: 'accommodation_chosen', sentAt: '2026-03-10T12:00:00Z' },
      ],
      maxPerWeek: 3,
    };
    expect(canSendNudge(input)).toBe(false);
  });

  it('allows if maxPerWeek not reached within last 7 days', () => {
    const input: NudgeInput = {
      ...baseInput,
      history: [
        { type: 'deadline_approaching', sentAt: '2026-03-08T12:00:00Z' }, // 7 days ago, but counts
        { type: 'date_locked', sentAt: '2026-03-09T12:00:00Z' },
      ],
      maxPerWeek: 3,
    };
    expect(canSendNudge(input)).toBe(true);
  });

  it('ignores nudges older than 7 days', () => {
    const input: NudgeInput = {
      ...baseInput,
      history: [
        { type: 'deadline_approaching', sentAt: '2026-03-07T11:59:00Z' }, // just over 7 days, ignored
        { type: 'date_locked', sentAt: '2026-03-09T12:00:00Z' },
      ],
      maxPerWeek: 2,
    };
    expect(canSendNudge(input)).toBe(true);
  });

  it('counts different nudge types towards maxPerWeek', () => {
    const input: NudgeInput = {
      ...baseInput,
      history: [
        { type: 'deadline_approaching', sentAt: '2026-03-10T12:00:00Z' },
        { type: 'date_locked', sentAt: '2026-03-11T12:00:00Z' },
        { type: 'accommodation_chosen', sentAt: '2026-03-12T12:00:00Z' },
      ],
      maxPerWeek: 3,
    };
    expect(canSendNudge(input)).toBe(false);
  });

  it('blocks if maxPerWeek already reached even if minGap met', () => {
    const input: NudgeInput = {
      ...baseInput,
      now: '2026-03-15T14:00:00Z',
      minGapHours: 24,
      history: [
        { type: 'deadline_approaching', sentAt: '2026-03-14T14:00:00Z' }, // exactly 24h ago (minGap met)
      ],
      maxPerWeek: 1, // but we already sent 1
    };
    expect(canSendNudge(input)).toBe(false); // blocked by maxPerWeek
  });

  it('blocks if maxPerWeek is exactly reached', () => {
    const input: NudgeInput = {
      ...baseInput,
      history: [
        { type: 'deadline_approaching', sentAt: '2026-03-14T12:00:00Z' },
        { type: 'date_locked', sentAt: '2026-03-15T10:00:00Z' },
        { type: 'accommodation_chosen', sentAt: '2026-03-15T11:00:00Z' },
      ],
      maxPerWeek: 3,
    };
    expect(canSendNudge(input)).toBe(false);
  });

  it('allows if just below maxPerWeek within window', () => {
    const input: NudgeInput = {
      ...baseInput,
      now: '2026-03-15T14:00:00Z',
      minGapHours: 24,
      history: [
        { type: 'deadline_approaching', sentAt: '2026-03-13T14:00:00Z' }, // >24h ago
        { type: 'date_locked', sentAt: '2026-03-14T12:00:00Z' }, // >24h since last
      ],
      maxPerWeek: 3, // 2 sent, room for 1 more
    };
    expect(canSendNudge(input)).toBe(true);
  });
});
