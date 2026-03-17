// src/core/stripMarkdown.ts
// Platform-agnostic helper for finding rendered text in raw markdown source.

/**
 * Find the `n`-th (0-based) occurrence of `text` (rendered form, no inline
 * markers) within `source` (raw markdown), using a single-pass normalisation
 * that strips inline markers (`*`, `` ` ``, `~~`), skips block-level markers
 * (`#`, `>`) at line starts, and collapses whitespace runs to a single space.
 *
 * Returns the raw source offset and the verbatim source span that renders to
 * `text`, or `null` if the n-th occurrence does not exist.
 */
export function findInStrippedSource(
  source: string,
  text: string,
  n: number,
): { offset: number; sourceText: string } | null {
  // Single-pass: build normalized source + posMap[i] = source index of normalized[i].
  const posMap: number[] = [];
  let normalized = '';
  let prevWasSpace = false;
  let i = 0;
  let atLineStart = true;
  while (i < source.length) {
    // Skip block-level markers at the start of a line: # (headings), > (blockquotes)
    if (atLineStart && (source[i] === '#' || source[i] === '>')) {
      while (i < source.length && (source[i] === '#' || source[i] === '>' || source[i] === ' ' || source[i] === '\t')) i++;
      atLineStart = false;
      continue;
    }
    // Skip inline markdown markers: *, **, ***, `, ``, ```, ~~
    if (source[i] === '*' || source[i] === '`') {
      const ch = source[i];
      while (i < source.length && source[i] === ch) i++;
      prevWasSpace = false;
      atLineStart = false;
      continue;
    }
    if (source[i] === '~' && source[i + 1] === '~') {
      i += 2;
      prevWasSpace = false;
      atLineStart = false;
      continue;
    }
    // Collapse any whitespace (space, tab, \r, \n) to a single space.
    if (source[i] === ' ' || source[i] === '\t' || source[i] === '\r' || source[i] === '\n') {
      if (source[i] === '\n') atLineStart = true;
      if (!prevWasSpace && normalized.length > 0) {
        posMap.push(i);
        normalized += ' ';
        prevWasSpace = true;
      }
      i++;
      continue;
    }
    posMap.push(i);
    normalized += source[i];
    prevWasSpace = false;
    atLineStart = false;
    i++;
  }

  // Normalize the search text identically.
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (!normalizedText) return null;

  // Find the nth occurrence of normalizedText in the normalized source.
  let count = 0;
  let from = 0;
  while (true) {
    const idx = normalized.indexOf(normalizedText, from);
    if (idx === -1) return null;
    if (count === n) {
      const srcStart = posMap[idx];
      const lastNormIdx = idx + normalizedText.length - 1;
      // posMap[lastNormIdx + 1] is where the next non-stripped char starts in source,
      // so slicing up to that point captures any trailing markers/newlines in the span.
      const srcEnd =
        lastNormIdx + 1 < posMap.length ? posMap[lastNormIdx + 1] : source.length;
      return { offset: srcStart, sourceText: source.slice(srcStart, srcEnd) };
    }
    count++;
    from = idx + 1;
  }
}
