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
    // Bulleted list markers (`-`, `+`) at line start. `*` is already consumed by
    // the inline-marker rule below.
    if (
      atLineStart &&
      (source[i] === '-' || source[i] === '+') &&
      (source[i + 1] === ' ' || source[i + 1] === '\t')
    ) {
      i += 2;
      while (i < source.length && (source[i] === ' ' || source[i] === '\t')) i++;
      atLineStart = false;
      continue;
    }
    // Numbered list markers at line start: `1.` / `23)` etc., followed by a space.
    if (atLineStart && source[i] >= '0' && source[i] <= '9') {
      let j = i;
      while (j < source.length && source[j] >= '0' && source[j] <= '9') j++;
      if (
        j < source.length &&
        (source[j] === '.' || source[j] === ')') &&
        (source[j + 1] === ' ' || source[j + 1] === '\t')
      ) {
        i = j + 2;
        while (i < source.length && (source[i] === ' ' || source[i] === '\t')) i++;
        atLineStart = false;
        continue;
      }
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
    // Treat <br>, <br/>, <br /> as a single whitespace — common in table cells
    // to force a line break. Rendered selection includes '\n' for these.
    if (source[i] === '<') {
      const brMatch = /^<br\s*\/?>/i.exec(source.slice(i, i + 8));
      if (brMatch) {
        if (!prevWasSpace && normalized.length > 0) {
          posMap.push(i);
          normalized += ' ';
          prevWasSpace = true;
        }
        i += brMatch[0].length;
        atLineStart = false;
        continue;
      }
    }
    // Escaped punctuation: \X in markdown renders as X. Skip the backslash so
    // the literal character is matched directly.
    if (source[i] === '\\' && i + 1 < source.length) {
      const next = source[i + 1];
      if ('\\`*_{}[]()#+-.!|<>~"\'?:'.indexOf(next) !== -1) {
        i++; // skip the backslash, emit the next char in the normal path below
      }
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
