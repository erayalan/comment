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
  // When inside a link/image label, marks where the closing `]` sits and where
  // scanning resumes past the trailing `(url)` / `[ref]` so only the label text
  // (which is what the browser selects) contributes to the normalized output.
  let pendingLinkClose: { at: number; resume: number } | null = null;
  while (i < source.length) {
    // Resume past link/image markup once the label's closing `]` is reached.
    if (pendingLinkClose && i === pendingLinkClose.at) {
      i = pendingLinkClose.resume;
      pendingLinkClose = null;
      atLineStart = false;
      continue;
    }
    // Skip block-level markers at the start of a line: # (headings), > (blockquotes)
    if (atLineStart && (source[i] === '#' || source[i] === '>')) {
      while (i < source.length && (source[i] === '#' || source[i] === '>' || source[i] === ' ' || source[i] === '\t')) i++;
      atLineStart = false;
      continue;
    }
    // Skip link reference definitions ( `[label]: url "title"` ) — they render
    // to nothing. Only at line start, and only when a `]:` closes the label.
    if (atLineStart && source[i] === '[') {
      const close = source.indexOf(']', i + 1);
      const lineEnd = _lineEnd(source, i);
      if (close !== -1 && close < lineEnd && source[close + 1] === ':') {
        i = lineEnd;
        continue;
      }
    }
    // Skip GFM table delimiter rows ( `|---|:--:|` ): only pipes, dashes,
    // colons and whitespace, with at least one dash. They render to nothing.
    if (atLineStart && (source[i] === '|' || source[i] === ':' || source[i] === '-')) {
      const lineEnd = _lineEnd(source, i);
      const line = source.slice(i, lineEnd);
      if (/^[|\s:-]*-[|\s:-]*$/.test(line)) {
        i = lineEnd;
        continue;
      }
    }
    // Image: `![alt](url)` / `![alt][ref]` render with no selectable text
    // (alt becomes an attribute), so skip the whole construct.
    if (source[i] === '!' && source[i + 1] === '[') {
      const end = _imageEnd(source, i);
      if (end !== -1) {
        i = end;
        atLineStart = false;
        continue;
      }
    }
    // Inline link / full reference link: `[label](url)` or `[label][ref]`.
    // Emit only the label (scanned normally); skip the trailing target.
    if (source[i] === '[' && !pendingLinkClose) {
      const close = _matchBracket(source, i);
      if (close !== -1) {
        const after = source[close + 1];
        if (after === '(') {
          const paren = source.indexOf(')', close + 2);
          if (paren !== -1) {
            pendingLinkClose = { at: close, resume: paren + 1 };
            i++; // step over `[`, scan the label normally
            atLineStart = false;
            continue;
          }
        } else if (after === '[') {
          const refClose = source.indexOf(']', close + 2);
          if (refClose !== -1) {
            pendingLinkClose = { at: close, resume: refClose + 1 };
            i++; // step over `[`, scan the label normally
            atLineStart = false;
            continue;
          }
        }
        // Otherwise (lone `[label]`) leave brackets literal — they render verbatim.
      }
    }
    // Table cell separators: an unescaped `|` renders as a cell boundary, which
    // the browser serializes as whitespace between cell texts.
    if (source[i] === '|') {
      if (!prevWasSpace && normalized.length > 0) {
        posMap.push(i);
        normalized += ' ';
        prevWasSpace = true;
      }
      i++;
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
    // Skip inline markdown markers: *, **, ***, `, ``, ```
    if (source[i] === '*' || source[i] === '`') {
      const ch = source[i];
      while (i < source.length && source[i] === ch) i++;
      prevWasSpace = false;
      atLineStart = false;
      continue;
    }
    // Underscore emphasis: `_italic_`, `__bold__`. Unlike `*`, markdown-it does
    // NOT treat intraword underscores (`snake_case`) as emphasis, so only strip
    // a `_` run when it is NOT flanked by alphanumerics on both sides.
    if (source[i] === '_') {
      let j = i;
      while (j < source.length && source[j] === '_') j++;
      const prev = source[i - 1];
      const next = source[j];
      const intraword = _isWordChar(prev) && _isWordChar(next);
      if (!intraword) {
        i = j; // strip the delimiter run
        prevWasSpace = false;
        atLineStart = false;
        continue;
      }
      // intraword — fall through and emit the underscores literally
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

/** Index of the end of the line containing `i` (the `\n`, or end of string). */
function _lineEnd(source: string, i: number): number {
  const nl = source.indexOf('\n', i);
  return nl === -1 ? source.length : nl;
}

/** True for characters markdown-it treats as "word" chars for intraword `_`. */
function _isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[\p{L}\p{N}]/u.test(c);
}

/**
 * Given `[` at `open`, return the index of its matching `]` (no nesting beyond
 * a simple depth counter), or -1. Does not cross blank lines.
 */
function _matchBracket(source: string, open: number): number {
  let depth = 0;
  for (let k = open; k < source.length; k++) {
    const c = source[k];
    if (c === '\\') { k++; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return k;
    } else if (c === '\n' && source[k + 1] === '\n') {
      return -1;
    }
  }
  return -1;
}

/**
 * Given `!` at `start` (followed by `[`), return the index just past the whole
 * image construct (`![alt](url)` or `![alt][ref]`), or -1 if it isn't one.
 */
function _imageEnd(source: string, start: number): number {
  const close = _matchBracket(source, start + 1);
  if (close === -1) return -1;
  const after = source[close + 1];
  if (after === '(') {
    const paren = source.indexOf(')', close + 2);
    return paren === -1 ? -1 : paren + 1;
  }
  if (after === '[') {
    const refClose = source.indexOf(']', close + 2);
    return refClose === -1 ? -1 : refClose + 1;
  }
  // `![alt]` with no target — treat the bracketed part as consumed.
  return close + 1;
}
