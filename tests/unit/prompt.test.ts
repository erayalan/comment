// tests/unit/prompt.test.ts
import assert from 'assert';
import { assembleReviewPrompt } from '../../src/core/prompt.js';
import type { Comment } from '../../src/core/types.js';

function makeComment(anchorText: string, body: string): Comment {
  return {
    id: 'test-id',
    anchor: { text: anchorText, sourceOffset: 0, contextBefore: '', contextAfter: '' },
    body,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('assembleReviewPrompt', () => {
  it('returns empty string when no files have comments', () => {
    const result = assembleReviewPrompt([{ filename: 'a.md', comments: [] }]);
    assert.strictEqual(result, '');
  });

  it('returns empty string for empty input array', () => {
    assert.strictEqual(assembleReviewPrompt([]), '');
  });

  it('single file: contains filename heading, anchor, and comment — no document content', () => {
    const result = assembleReviewPrompt([
      {
        filename: 'doc.md',
        comments: [makeComment('quick brown', 'Too cliché')],
      },
    ]);

    assert.ok(result.includes('# File: doc.md'));
    assert.ok(result.includes('**Anchor:** quick brown'));
    assert.ok(result.includes('**Comment:** Too cliché'));
    // Full document content must NOT be included
    assert.ok(!result.includes('## Comments'));
  });

  it('multiple comments in one file are each included', () => {
    const result = assembleReviewPrompt([
      {
        filename: 'doc.md',
        comments: [
          makeComment('A', 'First comment'),
          makeComment('B', 'Second comment'),
        ],
      },
    ]);

    assert.ok(result.includes('**Anchor:** A'));
    assert.ok(result.includes('**Comment:** First comment'));
    assert.ok(result.includes('**Anchor:** B'));
    assert.ok(result.includes('**Comment:** Second comment'));
  });

  it('multi-file output contains --- separator and both filenames', () => {
    const result = assembleReviewPrompt([
      { filename: 'a.md', comments: [makeComment('A', 'comment A')] },
      { filename: 'b.md', comments: [makeComment('B', 'comment B')] },
    ]);

    assert.ok(result.includes('# File: a.md'));
    assert.ok(result.includes('# File: b.md'));
    assert.ok(result.includes('---'));
  });

  it('files with zero comments are excluded from output', () => {
    const result = assembleReviewPrompt([
      { filename: 'a.md', comments: [makeComment('A', 'comment A')] },
      { filename: 'b.md', comments: [] },
    ]);

    assert.ok(result.includes('# File: a.md'));
    assert.ok(!result.includes('# File: b.md'));
  });
});
