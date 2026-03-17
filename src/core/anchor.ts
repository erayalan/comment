// src/core/anchor.ts
// Four-pass anchor relocation — platform-agnostic (zero vscode imports).

import type { CommentAnchor } from './types.js';
import { findInStrippedSource } from './stripMarkdown.js';

/**
 * Locate the character offset of `anchor.text` in `source` using a four-pass
 * strategy:
 *   Pass 1 — exact offset: if source[offset … offset+len] === text, return offset.
 *   Pass 2 — context search: find contextBefore + text + contextAfter as a
 *             substring; return position of text within that match.
 *   Pass 3 — overlap scoring: find all occurrences of text; score each by how
 *             well the surrounding 40-char context matches the stored context;
 *             return the highest-scoring position.
 *   Pass 4 — typographer reversal: reverse markdown-it typographer chars in
 *             `text` (' ' → ', — → ---, etc.) and repeat passes 1–3 against
 *             the ASCII source. Handles anchors stored in rendered (Unicode)
 *             form when the source still has ASCII equivalents.
 *
 * Returns -1 if no occurrence can be matched (orphaned anchor).
 */
export function relocateAnchor(source: string, anchor: CommentAnchor): number {
  const { text, sourceOffset, contextBefore, contextAfter } = anchor;

  console.log('[anchor] relocateAnchor called', {
    text: text.slice(0, 80),
    sourceOffset,
    contextBefore: contextBefore.slice(-20),
    contextAfter: contextAfter.slice(0, 20),
    sourceLength: source.length,
  });

  if (text.length === 0) {
    console.log('[anchor] ORPHANED: empty anchor text');
    return -1;
  }

  const result = _relocateWithText(source, text, sourceOffset, contextBefore, contextAfter);
  if (result !== -1) {
    console.log('[anchor] FOUND at offset', result);
    return result;
  }

  // ── Pass 4: reverse typographer and retry ────────────────────────────────
  const reversedText = _reverseTypographer(text);
  if (reversedText !== text) {
    console.log('[anchor] Pass 4: trying typographer-reversed text', { reversedText: reversedText.slice(0, 80) });
    const r4 = _relocateWithText(source, reversedText, sourceOffset, contextBefore, contextAfter);
    if (r4 !== -1) {
      console.log('[anchor] FOUND (pass 4 typographer) at offset', r4);
      return r4;
    }
  }

  console.log('[anchor] ORPHANED: all passes failed for text', JSON.stringify(text.slice(0, 80)));
  return -1;
}

/** Runs passes 1–3 for a given candidate text string. */
function _relocateWithText(
  source: string,
  text: string,
  sourceOffset: number,
  contextBefore: string,
  contextAfter: string,
): number {
  // ── Pass 1: exact offset ─────────────────────────────────────────────────
  if (
    sourceOffset >= 0 &&
    sourceOffset + text.length <= source.length &&
    source.slice(sourceOffset, sourceOffset + text.length) === text
  ) {
    console.log('[anchor] Pass 1 (exact offset): HIT at', sourceOffset);
    return sourceOffset;
  }
  console.log('[anchor] Pass 1 (exact offset): miss', {
    sourceOffset,
    atOffset: source.slice(sourceOffset, sourceOffset + text.length).slice(0, 40),
  });

  // ── Pass 2: context string search ────────────────────────────────────────
  const fullContext = contextBefore + text + contextAfter;
  if (fullContext.length > text.length) {
    const ctxIdx = source.indexOf(fullContext);
    if (ctxIdx !== -1) {
      console.log('[anchor] Pass 2 (full context): HIT at', ctxIdx + contextBefore.length);
      return ctxIdx + contextBefore.length;
    }

    if (contextBefore.length > 0) {
      const leftIdx = source.indexOf(contextBefore + text);
      if (leftIdx !== -1) {
        console.log('[anchor] Pass 2 (left context): HIT at', leftIdx + contextBefore.length);
        return leftIdx + contextBefore.length;
      }
    }

    if (contextAfter.length > 0) {
      const rightIdx = source.indexOf(text + contextAfter);
      if (rightIdx !== -1) {
        console.log('[anchor] Pass 2 (right context): HIT at', rightIdx);
        return rightIdx;
      }
    }
    console.log('[anchor] Pass 2 (context search): miss');
  }

  // ── Pass 3: overlap scoring ───────────────────────────────────────────────
  let bestOffset = -1;
  let bestScore = -1;
  let searchFrom = 0;
  let occurrenceCount = 0;

  while (true) {
    const idx = source.indexOf(text, searchFrom);
    if (idx === -1) break;
    occurrenceCount++;

    const actualBefore = source.slice(Math.max(0, idx - 40), idx);
    const actualAfter = source.slice(idx + text.length, idx + text.length + 40);

    const score =
      _suffixOverlap(actualBefore, contextBefore) +
      _prefixOverlap(actualAfter, contextAfter);

    console.log('[anchor] Pass 3 candidate at', idx, { score, actualBefore: actualBefore.slice(-20), actualAfter: actualAfter.slice(0, 20) });

    if (score > bestScore) {
      bestScore = score;
      bestOffset = idx;
    }

    searchFrom = idx + 1;
  }

  console.log('[anchor] Pass 3 (overlap scoring): occurrences found =', occurrenceCount, 'bestScore =', bestScore, 'bestOffset =', bestOffset);

  if (bestScore > 0 || (bestOffset !== -1 && bestScore === 0)) return bestOffset;

  // ── Pass 5: stripped/fuzzy search ────────────────────────────────────────
  // Handles anchor.text (rendered form, no inline markers) against raw source
  // that contains backtick code spans, asterisks, etc.
  let sn = 0;
  while (true) {
    const found = findInStrippedSource(source, text, sn);
    if (found === null) break;
    const actualBefore = source.slice(Math.max(0, found.offset - 40), found.offset);
    const actualAfter = source.slice(
      found.offset + found.sourceText.length,
      found.offset + found.sourceText.length + 40,
    );
    const score = _suffixOverlap(actualBefore, contextBefore) + _prefixOverlap(actualAfter, contextAfter);
    console.log('[anchor] Pass 5 (stripped fuzzy) candidate at', found.offset, { sourceText: found.sourceText.slice(0, 40), score });
    if (score > bestScore) {
      bestScore = score;
      bestOffset = found.offset;
    }
    sn++;
  }

  console.log('[anchor] Pass 5 (stripped fuzzy): sn =', sn, 'bestScore =', bestScore, 'bestOffset =', bestOffset);

  return bestScore >= 0 && bestOffset !== -1 ? bestOffset : -1;
}

/**
 * Reverse markdown-it typographer transformations: convert rendered Unicode
 * punctuation back to the ASCII sequences the source file contains.
 */
function _reverseTypographer(text: string): string {
  return text
    .replace(/\u2018|\u2019/g, "'") // ' ' → straight apostrophe
    .replace(/\u201C|\u201D/g, '"') // " " → straight double quote
    .replace(/\u2014/g, '---') // — (em dash) → triple hyphen
    .replace(/\u2013/g, '--') // – (en dash) → double hyphen
    .replace(/\u2026/g, '...'); // … → three dots
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Count the length of the longest common suffix of `a` and `b`.
 * Used to score contextBefore similarity.
 */
function _suffixOverlap(a: string, b: string): number {
  let score = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 1; i <= len; i++) {
    if (a[a.length - i] === b[b.length - i]) {
      score++;
    } else {
      break;
    }
  }
  return score;
}

/**
 * Count the length of the longest common prefix of `a` and `b`.
 * Used to score contextAfter similarity.
 */
function _prefixOverlap(a: string, b: string): number {
  let score = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) {
      score++;
    } else {
      break;
    }
  }
  return score;
}
