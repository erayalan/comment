import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import MarkdownIt from 'markdown-it';
import { v4 as uuidv4 } from 'uuid';

import type { Comment, CommentAnchor } from '../core/types.js';
import { createComment, deleteComment, updateComment } from '../core/comment.js';
import { relocateAnchor } from '../core/anchor.js';
import { readSidecar, writeSidecar, getSidecarPath } from '../core/sidecar.js';
import { findInStrippedSource } from '../core/stripMarkdown.js';

// ── Module-level active file tracking ────────────────────────────────────────
// Exposed via getter for src/host/commands.ts (see Decision 9 in research.md).
let _activeFilePath: string | undefined;

export function getActiveFilePath(): string | undefined {
  return _activeFilePath;
}

// ── T010: renderMarkdown ──────────────────────────────────────────────────────

// html: true — tables rely on `<br>` for intra-cell line breaks; source is the user's own markdown.
const _md = new MarkdownIt({ html: true, linkify: true, typographer: true });

export function renderMarkdown(mdSource: string): string {
  return _md.render(mdSource);
}

// ── T009: buildWebviewHtml ────────────────────────────────────────────────────

export function buildWebviewHtml(
  nonce: string,
  bodyHtml: string,
  webviewCssUri: vscode.Uri,
  githubMarkdownCssUri: vscode.Uri,
  webviewJsUri: vscode.Uri,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src vscode-resource: https:;">
  <link rel="stylesheet" nonce="${nonce}" href="${githubMarkdownCssUri}">
  <link rel="stylesheet" nonce="${nonce}" href="${webviewCssUri}">
  <title>Markdown Preview</title>
</head>
<body>
  <div id="canvas">
    <article id="preview" class="markdown-body">${bodyHtml}</article>
    <div id="gutter"></div>
  </div>
  <script nonce="${nonce}" src="${webviewJsUri}"></script>
</body>
</html>`;
}

// ── T019: injectHighlights ────────────────────────────────────────────────────

/**
 * Post-process rendered markdown HTML to wrap each comment's anchor text in a
 * `<mark class="comment-anchor" data-comment-id="…">` element. Uses
 * `node-html-parser` semantics: walks text nodes in the HTML string, skipping
 * content inside tags, and replaces the N-th occurrence (N derived from the
 * source-file character offset returned by `relocateAnchor`).
 *
 * Re-run on every render pass.
 */
export function injectHighlights(
  html: string,
  comments: Comment[],
  source: string,
): string {
  if (comments.length === 0) return html;

  interface Injection {
    offset: number;
    n: number;
    encodedText: string;
    id: string;
  }

  const injections: Injection[] = [];

  for (const comment of comments) {
    const offset = relocateAnchor(source, comment.anchor);
    if (offset === -1) continue; // orphaned — no mark injected

    const text = comment.anchor.text;

    // Count occurrences of text in stripped source BEFORE `offset` → occurrence index N.
    // Uses findInStrippedSource so anchor.text (rendered, no inline markers) correctly
    // matches source spans that contain backticks, asterisks, etc.
    let n = 0;
    for (let sn = 0; ; sn++) {
      const hit = findInStrippedSource(source, text, sn);
      if (hit === null || hit.offset >= offset) break;
      n++;
    }

    injections.push({ offset, n, encodedText: _htmlEncode(text), id: comment.id });
  }

  if (injections.length === 0) return html;

  // Process from last source occurrence to first so that earlier N values are
  // not invalidated by marks already injected at higher positions.
  injections.sort((a, b) => b.offset - a.offset);

  let result = html;
  for (const inj of injections) {
    result = _replaceNthTextOccurrence(result, inj.encodedText, inj.n, inj.id);
  }
  return result;
}

// ── Inline-tag helpers for cross-tag text matching ───────────────────────────

/**
 * HTML elements that are transparent to text matching: text inside or around
 * them is considered a single logical run for highlight injection.
 */
const _INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'cite', 'code', 'data', 'del', 'dfn', 'em',
  'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong',
  'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);

function _htmlTagName(tag: string): string {
  const m = tag.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Walk `html` as a token stream (text nodes + tags), matching `encodedText`
 * with whitespace-insensitive semantics, and wrap the `n`-th (0-based)
 * occurrence in a `<mark>` element. Block-level tags (and `<br>`) inside the
 * match span close and reopen the mark so the resulting HTML stays valid.
 */
function _replaceNthTextOccurrence(
  html: string,
  encodedText: string,
  n: number,
  commentId: string,
): string {
  // ── 1. Tokenize ───────────────────────────────────────────────────────────
  interface TextToken { type: 'text'; raw: string }
  interface TagToken  { type: 'tag';  raw: string; name: string; isInline: boolean; isBr: boolean }
  type Token = TextToken | TagToken;

  const tokens: Token[] = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) {
        tokens.push({ type: 'text', raw: html.slice(i) });
        break;
      }
      const raw = html.slice(i, end + 1);
      const name = _htmlTagName(raw);
      tokens.push({
        type: 'tag',
        raw,
        name,
        isInline: _INLINE_TAGS.has(name),
        isBr: name === 'br',
      });
      i = end + 1;
    } else {
      const end = html.indexOf('<', i);
      const endPos = end === -1 ? html.length : end;
      tokens.push({ type: 'text', raw: html.slice(i, endPos) });
      i = endPos;
    }
  }

  // ── 2. Build virtualText + posMap covering the full document ─────────────
  // charOffset = -1 marks a synthesized whitespace from a tag (not a real char).
  let virtualText = '';
  const posMap: Array<{ tokenIndex: number; charOffset: number }> = [];
  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti];
    if (tok.type === 'text') {
      for (let ci = 0; ci < tok.raw.length; ci++) {
        posMap.push({ tokenIndex: ti, charOffset: ci });
        virtualText += tok.raw[ci];
      }
    } else if (tok.isInline) {
      // transparent — no char emitted
    } else {
      // block tag or <br> — emit a whitespace so adjacent text stays separable.
      posMap.push({ tokenIndex: ti, charOffset: -1 });
      virtualText += tok.isBr ? '\n' : ' ';
    }
  }

  // ── 3. Whitespace-insensitive match ──────────────────────────────────────
  const norm = _normalizeWhitespace(virtualText);
  const normEncoded = _normalizeWhitespace(encodedText).normalized;
  if (!normEncoded) return html;

  let count = 0;
  let from = 0;
  while (true) {
    const idx = norm.normalized.indexOf(normEncoded, from);
    if (idx === -1) return html;

    if (count === n) {
      const vStart = norm.map[idx];
      const vEnd = norm.map[idx + normEncoded.length - 1];

      // Shrink to the first/last real character (skip synthesized whitespace).
      let sIdx = vStart;
      while (sIdx <= vEnd && posMap[sIdx].charOffset === -1) sIdx++;
      let eIdx = vEnd;
      while (eIdx >= sIdx && posMap[eIdx].charOffset === -1) eIdx--;
      if (sIdx > eIdx) return html;

      const startMap = posMap[sIdx];
      const endMap = posMap[eIdx];
      const startTok = startMap.tokenIndex;
      const endTok = endMap.tokenIndex;
      const markOpen = `<mark class="comment-anchor" data-comment-id="${commentId}">`;
      const markClose = '</mark>';

      let out = '';
      let inMark = false;
      for (let t = 0; t < tokens.length; t++) {
        const tok = tokens[t];
        if (t < startTok || t > endTok) {
          out += tok.raw;
          continue;
        }
        if (tok.type === 'text') {
          const isFirst = t === startTok;
          const isLast = t === endTok;
          const fromCh = isFirst ? startMap.charOffset : 0;
          const toCh = isLast ? endMap.charOffset + 1 : tok.raw.length;
          if (isFirst && fromCh > 0) out += tok.raw.slice(0, fromCh);
          if (!inMark) { out += markOpen; inMark = true; }
          out += tok.raw.slice(fromCh, toCh);
          if (isLast) {
            out += markClose;
            inMark = false;
            if (toCh < tok.raw.length) out += tok.raw.slice(toCh);
          }
        } else if (tok.isInline || tok.isBr) {
          // Inline tags and <br> are phrasing content — safe inside <mark>.
          out += tok.raw;
        } else {
          // Block-level tag inside the match — close mark, emit, reopen on next text.
          if (inMark) { out += markClose; inMark = false; }
          out += tok.raw;
        }
      }
      if (inMark) out += markClose;
      return out;
    }
    count++;
    from = idx + 1;
  }
}

/**
 * Collapse whitespace runs to a single space, strip leading/trailing whitespace,
 * and return a map from normalized index to original index.
 */
function _normalizeWhitespace(s: string): { normalized: string; map: number[] } {
  let normalized = '';
  const map: number[] = [];
  let prevWasSpace = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      if (!prevWasSpace && normalized.length > 0) {
        normalized += ' ';
        map.push(i);
        prevWasSpace = true;
      }
    } else {
      normalized += c;
      map.push(i);
      prevWasSpace = false;
    }
  }
  while (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1);
    map.pop();
  }
  return { normalized, map };
}

function _htmlEncode(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function _decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// ── Pending anchor storage ────────────────────────────────────────────────────

interface PendingAnchor {
  id: string;
  anchor: CommentAnchor;
  rectTop: number;
}

// ── GutterComment (matches webview-messages.md contract) ─────────────────────

interface GutterComment {
  id: string;
  anchorPreview: string;
  body: string;
  createdAt: string;
  rectTop: number;
  isOrphaned: boolean;
}

// ── T011: CommentPreviewPanel ─────────────────────────────────────────────────

export class CommentPreviewPanel {
  private static _instance: CommentPreviewPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _fileWatcher: vscode.FileSystemWatcher | undefined;
  private _context: vscode.ExtensionContext;
  private _pendingAnchor: PendingAnchor | undefined;

  /** Module-level getter: exposes the active file path to src/host/commands.ts */
  static get activeFilePath(): string | undefined {
    return _activeFilePath;
  }

  /**
   * Re-render the currently loaded file (e.g. after all comments are deleted).
   * No-op if no panel is open or no file is loaded.
   */
  static async refresh(): Promise<void> {
    if (CommentPreviewPanel._instance) {
      await CommentPreviewPanel._instance._sendCurrentFile();
    }
  }

  /**
   * Create or reveal the preview panel.
   * If filePath is provided the panel loads that file immediately.
   */
  static createOrShow(context: vscode.ExtensionContext, filePath?: string): void {
    const column = vscode.ViewColumn.One;

    if (CommentPreviewPanel._instance) {
      CommentPreviewPanel._instance._panel.reveal(column);
      if (filePath) {
        CommentPreviewPanel._instance._loadFile(filePath);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'commentPreview',
      'Markdown Preview',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'out', 'webview')),
        ],
      },
    );

    CommentPreviewPanel._instance = new CommentPreviewPanel(panel, context);

    if (filePath) {
      CommentPreviewPanel._instance._loadFile(filePath);
    }
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (msg: { type: string; [key: string]: unknown }) => {
        void this.handleMessage(msg);
      },
      null,
      this._disposables,
    );

    this._setWebviewContent();
  }

  /** Dispatch messages received from the webview. */
  async handleMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        if (_activeFilePath) {
          await this._sendCurrentFile();
        }
        break;

      // ── T021: textSelected ───────────────────────────────────────────────
      case 'textSelected': {
        const rawText = String(msg['selectedText'] ?? '');
        const selectedText = _decodeHtmlEntities(rawText.trim());
        const occurrenceIndex = Number(msg['occurrenceIndex'] ?? 0);
        const rectTop = Number(msg['rectTop'] ?? 0);
        const rectLeft = Number(msg['rectLeft'] ?? 0);

        if (!selectedText || !_activeFilePath) {
          console.log('[comment] host exit: missing selectedText or activeFilePath', { selectedText: !!selectedText, activeFilePath: !!_activeFilePath });
          break;
        }

        let source = '';
        try {
          source = fs.readFileSync(_activeFilePath, 'utf8');
        } catch (err) {
          console.log('[comment] host exit: file read error', err);
          break;
        }

        let sourceOffset = _findNthOccurrence(source, selectedText, occurrenceIndex);
        let sourceSpanLen = selectedText.length;
        // Log full text + char codes of first 8 chars to spot Unicode (typographer chars etc.)
        const charCodes = Array.from(selectedText.slice(0, 8)).map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
        console.log('[comment] host literal search', { selectedText, occurrenceIndex, found: sourceOffset !== -1, charCodes });

        if (sourceOffset === -1) {
          // Fallback 1: strip inline markdown markers + normalize whitespace (handles soft line-breaks).
          const fuzzy = findInStrippedSource(source, selectedText, occurrenceIndex);
          console.log('[comment] host fuzzy search', fuzzy ? { offset: fuzzy.offset, sourceText: fuzzy.sourceText } : 'null');
          if (fuzzy !== null) {
            sourceOffset = fuzzy.offset;
            sourceSpanLen = fuzzy.sourceText.length;
          }
        }

        if (sourceOffset === -1) {
          // Fallback 2: reverse markdown-it typographer transformations (' ' → ', — → ---, etc.)
          // then retry both literal and fuzzy searches.
          const reversedText = _reverseTypographer(selectedText);
          console.log('[comment] host typographer-reversed search', { reversedText: reversedText.slice(0, 80) });
          if (reversedText !== selectedText) {
            sourceOffset = _findNthOccurrence(source, reversedText, occurrenceIndex);
            if (sourceOffset !== -1) sourceSpanLen = reversedText.length;

            if (sourceOffset === -1) {
              const fuzzy2 = findInStrippedSource(source, reversedText, occurrenceIndex);
              console.log('[comment] host typographer+fuzzy search', fuzzy2 ? { offset: fuzzy2.offset, sourceText: fuzzy2.sourceText } : 'null');
              if (fuzzy2 !== null) {
                sourceOffset = fuzzy2.offset;
                sourceSpanLen = fuzzy2.sourceText.length;
              }
            }
          }
        }

        if (sourceOffset === -1) {
          console.log('[comment] host exit: not found — full selectedText:', JSON.stringify(selectedText));
          break;
        }

        // Always store selectedText (rendered form) as anchor.text so HTML injection can
        // find the text in the rendered output (which also has typographer chars).
        const contextBefore = source.slice(Math.max(0, sourceOffset - 40), sourceOffset);
        const contextAfter = source.slice(
          sourceOffset + sourceSpanLen,
          sourceOffset + sourceSpanLen + 40,
        );

        const pendingId = uuidv4();
        this._pendingAnchor = {
          id: pendingId,
          anchor: { text: selectedText, sourceOffset, contextBefore, contextAfter },
          rectTop,
        };

        void this._panel.webview.postMessage({
          type: 'showCommentForm',
          pendingAnchorId: pendingId,
          rectTop,
          rectLeft,
          anchorPreview: selectedText.slice(0, 60),
        });
        break;
      }

      // ── T023: submitComment ──────────────────────────────────────────────
      case 'submitComment': {
        const body = String(msg['body'] ?? '').trim();
        const pendingAnchorId = String(msg['pendingAnchorId'] ?? '');

        if (
          !body ||
          !this._pendingAnchor ||
          this._pendingAnchor.id !== pendingAnchorId ||
          !_activeFilePath
        ) {
          break;
        }

        const comment = createComment(this._pendingAnchor.anchor, body);
        this._pendingAnchor = undefined;

        const sidecarPath = getSidecarPath(_activeFilePath);
        const sidecar = await readSidecar(sidecarPath);
        const updated = { ...sidecar, comments: [...sidecar.comments, comment] };
        await writeSidecar(sidecarPath, updated);

        await this._sendCurrentFile();
        break;
      }

      // ── T023: cancelComment ──────────────────────────────────────────────
      case 'cancelComment': {
        const pendingAnchorId = String(msg['pendingAnchorId'] ?? '');
        if (this._pendingAnchor?.id === pendingAnchorId) {
          this._pendingAnchor = undefined;
        }
        break;
      }

      // ── updateComment ────────────────────────────────────────────────────
      case 'updateComment': {
        const commentId = String(msg['commentId'] ?? '');
        const body = String(msg['body'] ?? '').trim();
        if (!commentId || !body || !_activeFilePath) break;

        const sidecarPath = getSidecarPath(_activeFilePath);
        const sidecar = await readSidecar(sidecarPath);
        const updated = updateComment(sidecar, commentId, body);
        await writeSidecar(sidecarPath, updated);

        await this._sendCurrentFile();
        break;
      }

      // ── T024: deleteComment ──────────────────────────────────────────────
      case 'deleteComment': {
        const commentId = String(msg['commentId'] ?? '');
        if (!commentId || !_activeFilePath) break;

        const sidecarPath = getSidecarPath(_activeFilePath);
        const sidecar = await readSidecar(sidecarPath);
        const updated = deleteComment(sidecar, commentId);
        await writeSidecar(sidecarPath, updated);

        await this._sendCurrentFile();
        break;
      }
    }
  }

  /**
   * Send rendered markdown HTML + file path to the webview.
   * Re-used on every render (file open, file change, comment add/delete).
   */
  sendSetFileContent(html: string, filePath: string): void {
    void this._panel.webview.postMessage({ type: 'setFileContent', html, filePath });
  }

  // ── Private methods ─────────────────────────────────────────────────────────

  private _loadFile(filePath: string): void {
    _activeFilePath = filePath;
    this._panel.title = path.basename(filePath);

    // Replace any existing watcher for the previous file
    if (this._fileWatcher) {
      this._fileWatcher.dispose();
    }

    // FileSystemWatcher: re-render within 3 seconds of file change (FR-004)
    this._fileWatcher = vscode.workspace.createFileSystemWatcher(filePath);
    this._fileWatcher.onDidChange(() => {
      // Fire immediately — watcher latency is well under 3 s on local FS
      void this._sendCurrentFile();
    });
    this._disposables.push(this._fileWatcher);

    void this._sendCurrentFile();
  }

  private _setWebviewContent(): void {
    const webview = this._panel.webview;
    const nonce = _getNonce();

    const cssUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this._context.extensionPath, 'out', 'webview', 'styles.css'),
      ),
    );
    const githubMarkdownCssUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this._context.extensionPath, 'out', 'webview', 'github-markdown.css'),
      ),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this._context.extensionPath, 'out', 'webview', 'main.js'),
      ),
    );

    webview.html = buildWebviewHtml(nonce, '', cssUri, githubMarkdownCssUri, jsUri);
  }

  private async _sendCurrentFile(): Promise<void> {
    if (!_activeFilePath) return;

    let source = '';
    try {
      source = fs.readFileSync(_activeFilePath, 'utf8');
    } catch {
      return;
    }

    const sidecarPath = getSidecarPath(_activeFilePath);
    const sidecar = await readSidecar(sidecarPath);

    const rawHtml = renderMarkdown(source);
    const html = injectHighlights(rawHtml, sidecar.comments, source);

    this.sendSetFileContent(html, _activeFilePath);

    // Build GutterComment list for webview positioning
    const gutterComments: GutterComment[] = sidecar.comments.map((comment) => {
      const offset = relocateAnchor(source, comment.anchor);
      const isOrphaned = offset === -1;
      return {
        id: comment.id,
        anchorPreview: comment.anchor.text.slice(0, 60),
        body: comment.body,
        createdAt: comment.createdAt,
        // Webview queries the live DOM for actual Y position; -1 signals orphaned
        rectTop: isOrphaned ? -1 : 0,
        isOrphaned,
      };
    });

    void this._panel.webview.postMessage({ type: 'renderComments', comments: gutterComments });
  }

  private _dispose(): void {
    CommentPreviewPanel._instance = undefined;
    _activeFilePath = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return the character offset of the `n`-th (0-based) occurrence of `text` in
 * `source`, or -1 if fewer than `n + 1` occurrences exist.
 */
/**
 * Reverse markdown-it typographer transformations so that rendered Unicode
 * characters (curly quotes, em/en dashes, ellipsis) can be matched back to
 * their ASCII source equivalents.
 */
function _reverseTypographer(text: string): string {
  return text
    .replace(/\u2018|\u2019/g, "'") // ' ' → straight apostrophe
    .replace(/\u201C|\u201D/g, '"') // " " → straight double quote
    .replace(/\u2014/g, '---') // — (em dash) → triple hyphen (markdown-it default)
    .replace(/\u2013/g, '--') // – (en dash) → double hyphen
    .replace(/\u2026/g, '...'); // … → three dots
}

function _findNthOccurrence(source: string, text: string, n: number): number {
  let count = 0;
  let from = 0;
  while (true) {
    const idx = source.indexOf(text, from);
    if (idx === -1) return -1;
    if (count === n) return idx;
    count++;
    from = idx + 1;
  }
}

