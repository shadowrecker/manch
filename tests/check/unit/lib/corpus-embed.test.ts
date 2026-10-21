import { describe, it, expect } from 'vitest';
import { chunkText, pgvectorLiteral, embedText, EMBEDDING_DIMS } from '@/lib/modules/check/corpus/embed';

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkText('a short claim')).toEqual(['a short claim']);
  });
  it('returns [] for empty text', () => {
    expect(chunkText('   ')).toEqual([]);
  });
  it('splits long text into overlapping chunks under the limit', () => {
    const long = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkText(long, 200, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
    // overlap: the join of chunks covers the whole doc
    expect(chunks.join(' ')).toContain('word0');
    expect(chunks.join(' ')).toContain('word299');
  });
});

describe('pgvectorLiteral', () => {
  it('formats a vector as a pgvector text literal', () => {
    expect(pgvectorLiteral([0.1, -0.2, 0.3])).toBe('[0.1,-0.2,0.3]');
  });
});

describe('embedText', () => {
  it('returns null without an OpenAI key (graceful degradation)', async () => {
    expect(await embedText('anything')).toBeNull();
  });
});

describe('EMBEDDING_DIMS', () => {
  it('matches the pgvector column dimension', () => {
    expect(EMBEDDING_DIMS).toBe(1536);
  });
});
