// src/webview/main.ts — Webview entry point (runs in browser context).
// No vscode module; uses acquireVsCodeApi() provided by VS Code's webview runtime.

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// ── State ─────────────────────────────────────────────────────────────────────

/** Last renderComments payload — retained so gutter can be re-rendered on demand. */
let _lastComments: GutterComment[] = [];

/** Drag-detection state — used to distinguish intentional highlight from double-click. */
let _mouseDown = false;
let _wasDragging = false;
let _dragStartX = 0;
let _dragStartY = 0;

/** Temporary span wrapping the selected text while the comment form is open. */
let _draftAnchorSpan: HTMLSpanElement | null = null;

// ── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  vscode.postMessage({ type: 'ready' });

  // Delegated anchor-click handler: selecting highlighted text in preview
  // makes the corresponding gutter card's left-edge line thick + white.
  const previewEl = document.getElementById('preview');
  if (previewEl) {
    previewEl.addEventListener('click', (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('.comment-anchor') as HTMLElement | null;
      document.querySelectorAll('.gutter-card--selected').forEach((el) => {
        el.classList.remove('gutter-card--selected');
      });
      if (anchor) {
        const id = anchor.dataset['commentId'];
        if (id) {
          const card = document.querySelector(`.gutter-card[data-comment-id="${id}"]`);
          card?.classList.add('gutter-card--selected');
        }
      }
    });

    previewEl.addEventListener('dblclick', () => {
      _processSelection();
    });

    // Re-layout gutter cards on resize — text reflows change anchor vertical positions.
    new ResizeObserver(() => {
      if (_lastComments.length > 0) {
        _renderGutter(_lastComments);
      }
    }).observe(previewEl);
  }
});

// ── Draft anchor helpers ──────────────────────────────────────────────────────

function _removeDraftAnchor(): void {
  if (_draftAnchorSpan) {
    _draftAnchorSpan.replaceWith(...Array.from(_draftAnchorSpan.childNodes));
    _draftAnchorSpan = null;
  }
}

// ── T020: drag-to-highlight selection handler ────────────────────────────────

document.addEventListener('mousedown', (e: MouseEvent) => {
  if (e.button !== 0) return;
  _mouseDown = true;
  _wasDragging = false;
  _dragStartX = e.clientX;
  _dragStartY = e.clientY;
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (!_mouseDown) return;
  const dx = e.clientX - _dragStartX;
  const dy = e.clientY - _dragStartY;
  if (Math.sqrt(dx * dx + dy * dy) > 4) {
    _wasDragging = true;
  }
});

document.addEventListener('mouseup', (e: MouseEvent) => {
  if (e.button !== 0) return;
  const wasDragging = _wasDragging;
  _mouseDown = false;
  _wasDragging = false;

  if (!wasDragging) return;

  _processSelection();
});

/** Shared handler for both drag and double-click text selection in #preview. */
function _processSelection(): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { console.log('[comment] exit: no selection or collapsed'); return; }

  const selectedText = sel.toString().trim();
  if (!selectedText) { console.log('[comment] exit: empty/whitespace selection'); return; }

  const preview = document.getElementById('preview');
  const range = sel.getRangeAt(0);
  // Only handle selections entirely within #preview (rejects drags that start/end in the gutter)
  if (!preview || !preview.contains(range.startContainer) || !preview.contains(range.endContainer)) {
    console.log('[comment] exit: selection outside #preview', {
      startInPreview: preview?.contains(range.startContainer),
      endInPreview: preview?.contains(range.endContainer),
    });
    return;
  }

  // Reject selections that partially overlap an existing comment anchor mark.
  // Allow: selection fully inside a mark, or selection fully containing a mark.
  // Reject: selection that crosses a mark boundary from one side only.
  for (const mark of Array.from(preview.querySelectorAll('mark.comment-anchor'))) {
    if (!range.intersectsNode(mark)) continue;
    const fullyInside = mark.contains(range.startContainer) && mark.contains(range.endContainer);
    // Check if the selection fully contains the mark using standard compareBoundaryPoints.
    // START_TO_START <= 0: our range starts at or before the mark's start.
    // END_TO_END >= 0: our range ends at or after the mark's end.
    const markRange = document.createRange();
    markRange.selectNode(mark);
    const cmpStart = range.compareBoundaryPoints(Range.START_TO_START, markRange);
    const cmpEnd = range.compareBoundaryPoints(Range.END_TO_END, markRange);
    const fullyContains = cmpStart <= 0 && cmpEnd >= 0;
    console.log('[comment] anchor overlap check', {
      markText: mark.textContent?.slice(0, 40),
      fullyInside,
      fullyContains,
      cmpStart,
      cmpEnd,
    });
    if (!fullyInside && !fullyContains) {
      console.log('[comment] exit: partial overlap with existing mark');
      return;
    }
  }

  const firstRect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  // Convert viewport Y → canvas-document Y so the form is stable after scroll.
  const canvasEl = document.getElementById('canvas');
  const rectTop = firstRect.top + (canvasEl?.scrollTop ?? 0);
  const rectLeft = firstRect.left;

  const occurrenceIndex = _countOccurrencesBefore(selectedText, range);

  console.log('[comment] posting textSelected', { selectedText: selectedText.slice(0, 80), occurrenceIndex, rectTop });

  _removeDraftAnchor();
  try {
    const span = document.createElement('span');
    span.className = 'comment-draft-anchor';
    range.surroundContents(span);
    _draftAnchorSpan = span;
  } catch {
    console.log('[comment] surroundContents failed (cross-element selection) — continuing without draft highlight');
  }

  vscode.postMessage({
    type: 'textSelected',
    selectedText,
    occurrenceIndex,
    rectTop,
    rectLeft,
  });
}

/**
 * Count how many times `text` appears in DOM text nodes within `#preview`
 * BEFORE the start of `range` (exclusive).
 */
function _countOccurrencesBefore(text: string, range: Range): number {
  const preview = document.getElementById('preview');
  if (!preview) return 0;

  let count = 0;
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);

  let node = walker.nextNode();
  while (node) {
    if (node === range.startContainer) {
      // Count occurrences in this node before the selection start offset
      const textBefore = (node.textContent ?? '').slice(0, range.startOffset);
      let pos = 0;
      while (true) {
        const idx = textBefore.indexOf(text, pos);
        if (idx === -1) break;
        count++;
        pos = idx + 1;
      }
      break;
    }

    // Count all occurrences in this node
    const nodeText = node.textContent ?? '';
    let pos = 0;
    while (true) {
      const idx = nodeText.indexOf(text, pos);
      if (idx === -1) break;
      count++;
      pos = idx + 1;
    }

    node = walker.nextNode();
  }

  return count;
}

// ── Message dispatcher ────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as { type: string };
  dispatch(msg);
});

function dispatch(msg: { type: string; [key: string]: unknown }): void {
  switch (msg.type) {
    case 'setFileContent':
      setFileContent(msg as unknown as SetFileContentMessage);
      break;
    case 'renderComments':
      renderComments(msg as unknown as RenderCommentsMessage);
      break;
    case 'showCommentForm':
      showCommentForm(msg as unknown as ShowCommentFormMessage);
      break;
  }
}

// ── Message types ─────────────────────────────────────────────────────────────

interface SetFileContentMessage {
  type: 'setFileContent';
  html: string;
  filePath: string;
}

interface RenderCommentsMessage {
  type: 'renderComments';
  comments: GutterComment[];
}

interface ShowCommentFormMessage {
  type: 'showCommentForm';
  pendingAnchorId: string;
  rectTop: number;
  rectLeft: number;
  anchorPreview: string;
}

interface UpdateCommentMessage {
  type: 'updateComment';
  commentId: string;
  body: string;
}

interface GutterComment {
  id: string;
  anchorPreview: string;
  body: string;
  createdAt: string;
  rectTop: number;
  isOrphaned: boolean;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

function setFileContent(msg: SetFileContentMessage): void {
  const preview = document.getElementById('preview');
  if (preview) {
    preview.innerHTML = msg.html;
  }
  // Re-render gutter with updated DOM positions now that new HTML is set
  if (_lastComments.length > 0) {
    _renderGutter(_lastComments);
  }
}

// ── T022: showCommentForm ────────────────────────────────────────────────────

function showCommentForm(msg: ShowCommentFormMessage): void {
  const gutter = document.getElementById('gutter');
  if (!gutter) return;

  // Remove any existing inline input
  const existing = gutter.querySelector('.comment-form');
  if (existing) existing.remove();

  // Full re-sort: collect all absolutely-positioned cards + the new form entry,
  // sort by [anchorTop, anchorLeft] so same-line anchors appear left-to-right,
  // then assign stacked positions. This correctly places the new form ABOVE any
  // card whose anchor is to the right of the new selection on the same line.
  interface SortEntry { el: HTMLElement | null; anchorTop: number; anchorLeft: number; height: number; }
  const entries: SortEntry[] = [];

  const positionedCards = (Array.from(gutter.querySelectorAll('.gutter-card')) as HTMLElement[])
    .filter((c) => c.style.position === 'absolute');
  for (const card of positionedCards) {
    entries.push({
      el: card,
      anchorTop: parseFloat(card.dataset['anchorTop'] ?? '0') || 0,
      anchorLeft: parseFloat(card.dataset['anchorLeft'] ?? '0') || 0,
      height: card.getBoundingClientRect().height,
    });
  }
  entries.push({ el: null, anchorTop: msg.rectTop, anchorLeft: msg.rectLeft, height: 24 });

  entries.sort((a, b) => {
    if (Math.abs(a.anchorTop - b.anchorTop) > 10) return a.anchorTop - b.anchorTop;
    return a.anchorLeft - b.anchorLeft; // same line: left-to-right
  });

  let nextTop = 0;
  let formTop = 0;
  for (const entry of entries) {
    const actualTop = Math.max(entry.anchorTop, nextTop);
    if (entry.el === null) {
      formTop = actualTop;
    } else {
      entry.el.style.top = `${actualTop}px`;
    }
    nextTop = actualTop + entry.height + 4;
  }

  const form = document.createElement('div');
  form.className = 'comment-form';
  form.style.position = 'absolute';
  form.style.top = `${formTop}px`;

  const textarea = document.createElement('textarea');
  textarea.className = 'comment-inline-input';
  textarea.placeholder = 'Add comment…';
  textarea.rows = 1;

  // Auto-resize as user types; push cards below downward to avoid overlap
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
    const top = parseFloat(form.style.top) || 0;
    const bottom = top + form.getBoundingClientRect().height + 4;
    _relayoutCardsAfter(top, bottom);
  });

  // Guard against blur firing after a submit/cancel already ran
  let _done = false;

  const _submit = (): void => {
    if (_done) return;
    const body = textarea.value.trim();
    if (!body) return;
    _done = true;
    _removeDraftAnchor();
    form.remove();
    vscode.postMessage({ type: 'submitComment', body, pendingAnchorId: msg.pendingAnchorId });
  };

  const _cancel = (): void => {
    if (_done) return;
    _done = true;
    _removeDraftAnchor();
    form.remove();
    vscode.postMessage({ type: 'cancelComment', pendingAnchorId: msg.pendingAnchorId });
  };

  textarea.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (textarea.value.trim() === '') {
        _cancel();
      }
      // Non-empty: ignore Escape — user must delete text to cancel
    }
  });

  // Auto-save on blur: save if text present, cancel if empty
  textarea.addEventListener('blur', () => {
    if (textarea.value.trim() !== '') {
      _submit();
    } else {
      _cancel();
    }
  });

  form.appendChild(textarea);
  gutter.appendChild(form);
  textarea.focus();
}

// ── T025: renderComments ─────────────────────────────────────────────────────

function renderComments(msg: RenderCommentsMessage): void {
  _lastComments = msg.comments;
  _renderGutter(msg.comments);
}

function _renderGutter(comments: GutterComment[]): void {
  const gutter = document.getElementById('gutter');
  if (!gutter) return;

  // Remove existing cards (preserve any open comment form)
  const existingCards = gutter.querySelectorAll('.gutter-card');
  existingCards.forEach((c) => c.remove());

  // Compute actual DOM positions for non-orphaned comments
  const positioned: Array<{ comment: GutterComment; top: number; left: number }> = [];
  const orphaned: GutterComment[] = [];

  for (const comment of comments) {
    if (comment.isOrphaned || comment.rectTop === -1) {
      orphaned.push(comment);
    } else {
      // Query the live DOM for the mark element's actual position
      const mark = document.querySelector(
        `[data-comment-id="${comment.id}"]`,
      ) as HTMLElement | null;
      if (mark) {
        // Use first client rect to get the position of the first line of the mark,
        // which gives the correct top and left for multi-line highlights.
        // Add canvas.scrollTop to convert viewport Y → canvas-document Y so that
        // cards stay aligned with their marks regardless of scroll position.
        const firstRect = mark.getClientRects()[0] ?? mark.getBoundingClientRect();
        const canvasEl = document.getElementById('canvas');
        const top = firstRect.top + (canvasEl?.scrollTop ?? 0);
        const left = firstRect.left;
        positioned.push({ comment, top, left });
      } else {
        // Mark not found in DOM despite host saying it isn't orphaned — treat as orphaned
        orphaned.push({ ...comment, isOrphaned: true, rectTop: -1 });
      }
    }
  }

  // Sort by vertical position first; break ties left-to-right (same-line anchors).
  positioned.sort((a, b) => {
    const dy = a.top - b.top;
    if (Math.abs(dy) > 2) return dy; // different lines (2 px tolerance for sub-pixel)
    return a.left - b.left;          // same line: left-to-right
  });

  // Render positioned cards with collision avoidance so same-line cards stack vertically.
  let nextAvailableTop = 0;
  for (const { comment, top, left } of positioned) {
    const actualTop = Math.max(top, nextAvailableTop);
    const card = _buildGutterCard(comment, actualTop, top, left);
    gutter.appendChild(card);
    // Measure rendered height synchronously (element is in DOM, position: absolute).
    nextAvailableTop = actualTop + card.getBoundingClientRect().height + 4;
  }

  // Render orphaned cards at the bottom of the gutter
  for (const comment of orphaned) {
    const card = _buildGutterCard(comment, -1, -1, 0);
    gutter.appendChild(card);
  }
}

// ── Live re-layout helper ─────────────────────────────────────────────────────

/**
 * After an element above `aboveTopPx` grows to `newBottomPx`, push any
 * absolutely-positioned gutter cards that sit at or below `aboveTopPx` downward
 * so they don't overlap. Cards snap back toward their anchor positions when the
 * element shrinks.
 */
function _relayoutCardsAfter(aboveTopPx: number, newBottomPx: number): void {
  const gutter = document.getElementById('gutter');
  if (!gutter) return;

  const cards = (Array.from(gutter.querySelectorAll('.gutter-card')) as HTMLElement[])
    .filter((c) => c.style.position === 'absolute' && (parseFloat(c.style.top) || 0) > aboveTopPx)
    .sort((a, b) => {
      const aAnchorTop = parseFloat(a.dataset['anchorTop'] ?? '0') || 0;
      const bAnchorTop = parseFloat(b.dataset['anchorTop'] ?? '0') || 0;
      if (Math.abs(aAnchorTop - bAnchorTop) > 10) return aAnchorTop - bAnchorTop;
      return (parseFloat(a.dataset['anchorLeft'] ?? '0') || 0) - (parseFloat(b.dataset['anchorLeft'] ?? '0') || 0);
    });

  let nextTop = newBottomPx;
  for (const card of cards) {
    const anchorTop = parseFloat(card.dataset['anchorTop'] ?? '0') || 0;
    const actualTop = Math.max(anchorTop, nextTop);
    card.style.top = `${actualTop}px`;
    nextTop = actualTop + card.getBoundingClientRect().height + 4;
  }
}

// ── Gutter card — inline editable body ───────────────────────────────────────

function _buildGutterCard(
  comment: GutterComment,
  top: number,
  anchorTop: number = top,
  anchorLeft: number = 0,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'gutter-card';
  card.dataset['commentId'] = comment.id;
  card.dataset['anchorTop'] = String(anchorTop);
  card.dataset['anchorLeft'] = String(anchorLeft);

  if (top >= 0) {
    card.style.position = 'absolute';
    card.style.top = `${top}px`;
  } else {
    card.classList.add('gutter-card--orphaned');
  }

  if (comment.isOrphaned || top === -1) {
    const orphanLabel = document.createElement('div');
    orphanLabel.className = 'gutter-card-orphan-label';
    orphanLabel.textContent = 'Anchor not found';
    card.appendChild(orphanLabel);
  }

  const body = document.createElement('div');
  body.className = 'gutter-card-body';
  body.contentEditable = 'true';
  // innerText preserves \n line breaks on assignment and reading
  body.innerText = comment.body;

  // Guard against blur firing after an edit was already committed
  let _done = false;

  body.addEventListener('blur', () => {
    if (_done) return;
    const newBody = (body.innerText ?? '').trim();
    if (newBody === '') {
      _done = true;
      vscode.postMessage({ type: 'deleteComment', commentId: comment.id });
    } else if (newBody !== comment.body) {
      _done = true;
      vscode.postMessage({ type: 'updateComment', commentId: comment.id, body: newBody });
    }
  });

  // Re-layout cards below this one as its content grows or shrinks
  body.addEventListener('input', () => {
    const cardTopPx = parseFloat(card.style.top) || 0;
    const cardBottomPx = cardTopPx + card.getBoundingClientRect().height + 4;
    _relayoutCardsAfter(cardTopPx, cardBottomPx);
  });

  card.appendChild(body);
  return card;
}

function _formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
