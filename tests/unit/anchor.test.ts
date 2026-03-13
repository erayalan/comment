// tests/unit/anchor.test.ts
// Unit tests for src/core/anchor.ts — runs with plain mocha + ts-node.

import * as assert from 'assert';
import { relocateAnchor } from '../../src/core/anchor.js';
import type { CommentAnchor } from '../../src/core/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAnchor(
  text: string,
  source: string,
  occurrenceIndex = 0,
  contextLen = 40,
): CommentAnchor {
  let from = 0;
  let offset = -1;
  for (let i = 0; i <= occurrenceIndex; i++) {
    const idx = source.indexOf(text, from);
    if (idx === -1) throw new Error(`"${text}" not found in source at occurrence ${i}`);
    offset = idx;
    from = idx + 1;
  }
  return {
    text,
    sourceOffset: offset,
    contextBefore: source.slice(Math.max(0, offset - contextLen), offset),
    contextAfter: source.slice(offset + text.length, offset + text.length + contextLen),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('relocateAnchor', () => {
  describe('Pass 1 — exact offset match', () => {
    it('returns the stored sourceOffset when the text is still at that position', () => {
      const source = 'The quick brown fox';
      const anchor = makeAnchor('quick', source);
      assert.strictEqual(relocateAnchor(source, anchor), 4);
    });

    it('returns exact offset for anchor at start of file', () => {
      const source = 'Hello world';
      const anchor = makeAnchor('Hello', source);
      assert.strictEqual(relocateAnchor(source, anchor), 0);
    });

    it('returns exact offset for anchor at end of file', () => {
      const source = 'foo bar baz';
      const anchor = makeAnchor('baz', source);
      assert.strictEqual(relocateAnchor(source, anchor), 8);
    });
  });

  describe('Pass 2 — stale offset with context fallback', () => {
    it('finds text via full context string when offset is stale (text shifted right)', () => {
      const original = 'The quick brown fox';
      const anchor = makeAnchor('quick', original);
      // Prepend text to shift everything right
      const modified = 'INSERTED ' + original;
      const result = relocateAnchor(modified, anchor);
      assert.strictEqual(result, modified.indexOf('quick'));
    });

    it('finds text via full context string when offset is stale (text shifted left)', () => {
      const original = 'PREFIX quick SUFFIX';
      const anchor = makeAnchor('quick', original);
      // Remove prefix to shift left
      const modified = 'quick SUFFIX';
      // contextBefore won't match fully but contextAfter will help
      const result = relocateAnchor(modified, anchor);
      assert.ok(result >= 0, 'should find "quick" in modified source');
      assert.strictEqual(modified.slice(result, result + 'quick'.length), 'quick');
    });
  });

  describe('Pass 3 — overlap scoring with duplicate anchor text', () => {
    it('returns the occurrence with better context match when text appears twice', () => {
      // "fox" appears twice; anchor was created at the second occurrence
      const source = 'A red fox and a blue fox jumped over the fence.';
      const anchor = makeAnchor('fox', source, 1); // second "fox"

      // Corrupt the offset so passes 1 and 2 fail
      const staleable: CommentAnchor = { ...anchor, sourceOffset: 999 };

      const result = relocateAnchor(source, staleable);
      // Should find the second "fox" at index 21
      const expectedOffset = source.indexOf('fox', source.indexOf('fox') + 1);
      assert.strictEqual(result, expectedOffset);
    });

    it('returns -1 when text does not appear in source at all', () => {
      const anchor: CommentAnchor = {
        text: 'NOTHERE',
        sourceOffset: 0,
        contextBefore: '',
        contextAfter: '',
      };
      assert.strictEqual(relocateAnchor('hello world', anchor), -1);
    });

    it('returns -1 for an empty anchor text', () => {
      const anchor: CommentAnchor = {
        text: '',
        sourceOffset: 0,
        contextBefore: '',
        contextAfter: '',
      };
      assert.strictEqual(relocateAnchor('anything', anchor), -1);
    });
  });

  describe('edge cases', () => {
    it('returns the single occurrence when text appears exactly once', () => {
      const source = 'unique token here';
      const anchor = makeAnchor('unique', source);
      assert.strictEqual(relocateAnchor(source, anchor), 0);
    });

    it('handles anchor at source boundary with empty context', () => {
      const source = 'abc';
      const anchor: CommentAnchor = {
        text: 'abc',
        sourceOffset: 0,
        contextBefore: '',
        contextAfter: '',
      };
      assert.strictEqual(relocateAnchor(source, anchor), 0);
    });
  });
});
