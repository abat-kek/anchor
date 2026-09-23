import { describe, it, expect } from 'vitest';
import { buildJoinUrl } from '../src/domain/join-url';

describe('buildJoinUrl', () => {
  it('constructs join URL with encoded token', () => {
    const url = buildJoinUrl('https://example.com', 'mytoken123');
    expect(url).toBe('https://example.com/join/mytoken123');
  });

  it('encodes special characters in token', () => {
    const url = buildJoinUrl('https://example.com', 'token+with/special');
    expect(url).toBe('https://example.com/join/token%2Bwith%2Fspecial');
  });

  it('handles trailing slash in base URL', () => {
    const url = buildJoinUrl('https://example.com/', 'token123');
    expect(url).toBe('https://example.com/join/token123');
  });

  it('handles base URL without trailing slash', () => {
    const url = buildJoinUrl('https://example.com', 'token123');
    expect(url).toBe('https://example.com/join/token123');
  });

  it('works with localhost URLs', () => {
    const url = buildJoinUrl('http://localhost:3000', 'token123');
    expect(url).toBe('http://localhost:3000/join/token123');
  });
});
