import { describe, it, expect } from 'vitest';
import { greet } from '../src/domain/hello';

describe('greet', () => {
  it('greets a named crew', () => {
    expect(greet('Crew')).toBe('Anchor: Crew');
  });
});
