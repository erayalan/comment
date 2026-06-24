// tests/unit/stripMarkdown.test.ts
// Regression tests: every markdown construct (and cross-block combinations) must
// be locatable from the text the browser puts in `Selection.toString()`, so the
// comment box triggers for all formats. See findInStrippedSource.

import * as assert from 'assert';
import { findInStrippedSource } from '../../src/core/stripMarkdown.js';

/** Assert the rendered selection text resolves to a real source offset. */
function assertFound(source: string, selected: string): void {
  // Mirror the host: collapse whitespace the way Selection.toString() varies.
  const r = findInStrippedSource(source, selected, 0);
  assert.ok(r !== null, `expected to locate ${JSON.stringify(selected)} in ${JSON.stringify(source)}`);
}

function assertNotFound(source: string, selected: string): void {
  const r = findInStrippedSource(source, selected, 0);
  assert.strictEqual(r, null, `expected NOT to locate ${JSON.stringify(selected)}`);
}

describe('findInStrippedSource — single constructs trigger the comment box', () => {
  const cases: Array<[string, string, string]> = [
    ['heading', '# My Title', 'My Title'],
    ['sub-heading', '## Sub Title', 'Sub Title'],
    ['paragraph', 'A normal paragraph of text.', 'A normal paragraph of text.'],
    ['bullet (-)', '- Bullet item alpha', 'Bullet item alpha'],
    ['bullet (*)', '* Star bullet beta', 'Star bullet beta'],
    ['numbered', '1. First numbered item', 'First numbered item'],
    ['bold (**)', 'This has **bold words** inside.', 'This has bold words inside.'],
    ['italic (*)', 'This has *italic words* inside.', 'This has italic words inside.'],
    ['italic (_)', 'This has _underscore italic_ words.', 'This has underscore italic words.'],
    ['bold (__)', 'This has __underscore bold__ words.', 'This has underscore bold words.'],
    ['inline code', 'Inline `code span` here.', 'Inline code span here.'],
    ['blockquote', '> A quoted line of text.', 'A quoted line of text.'],
    ['strikethrough', 'This is ~~struck out~~ text.', 'This is struck out text.'],
    ['inline link', 'See [the link text](https://example.com) now.', 'See the link text now.'],
    ['heading + link', '# Title with [a link](http://x.com) inside', 'Title with a link inside'],
    ['bullet + link', '- Bullet with [a link](http://x.com) here', 'Bullet with a link here'],
    ['image (alt not selectable)', 'Look at ![alt text](http://x.com/i.png) image.', 'Look at image.'],
    ['reference link', 'See [ref link][1] here.\n\n[1]: http://x.com', 'See ref link here.'],
    ['autolink', 'Visit https://example.com today.', 'Visit https://example.com today.'],
    ['table (whole)', '| Col A | Col B |\n|-------|-------|\n| cell one | cell two |', 'Col A\nCol B\ncell one\ncell two'],
    ['table (single cell)', '| Col A | Col B |\n|---|---|\n| cell one | cell two |', 'cell one'],
  ];
  for (const [name, source, selected] of cases) {
    it(name, () => assertFound(source, selected));
  }
});

describe('findInStrippedSource — cross-block selections trigger the comment box', () => {
  const doc = [
    '# My Title',
    '',
    'A normal paragraph of text.',
    '',
    '- Bullet item alpha',
    '- Bullet item beta',
    '',
    '## Sub Title',
    '',
    'Text with **bold** and [a link](http://x.com) and `code`.',
  ].join('\n');

  const combos: Array<[string, string]> = [
    ['heading → paragraph', 'My Title\n\nA normal paragraph of text.'],
    ['paragraph → bullet', 'A normal paragraph of text.\n\nBullet item alpha'],
    ['bullet → bullet', 'Bullet item alpha\n\nBullet item beta'],
    ['bullet → heading', 'Bullet item beta\n\nSub Title'],
    ['heading tail → paragraph head', 'Title\nA normal paragraph'],
    ['heading → paragraph with link/code', 'Sub Title\n\nText with bold and a link and code.'],
  ];
  for (const [name, selected] of combos) {
    it(name, () => assertFound(doc, selected));
  }
});

describe('findInStrippedSource — does not over-strip literal punctuation', () => {
  it('keeps literal brackets that are not links', () =>
    assertFound('Fix the [NEEDS CLARIFICATION] marker.', '[NEEDS CLARIFICATION]'));
  it('keeps intraword underscores (snake_case)', () =>
    assertFound('Use snake_case names.', 'snake_case'));
  it('keeps array index brackets', () =>
    assertFound('Read arr[0] value.', 'arr[0]'));
  it('non-link bracketed text is not matched as a stripped label', () =>
    // The brackets are literal, so searching for the bare inner text must fail.
    assertNotFound('Fix the [NEEDS CLARIFICATION] marker.', 'the NEEDS CLARIFICATION marker'));
});
