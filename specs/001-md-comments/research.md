# Research: Inline Markdown Comment Extension

**Feature**: `001-md-comments` | **Phase**: 0 | **Date**: 2026-02-26

All NEEDS CLARIFICATION items and technology unknowns are resolved below.

---

## Decision 1 — Anchor Data Structure

**Question**: How do we store a comment's attachment point so it survives minor
file edits and can be reliably re-displayed after re-render?

**Decision**: Four-field anchor record stored in the sidecar JSON:

```typescript
interface CommentAnchor {
  text: string;          // Verbatim selected text (max ~500 chars)
  sourceOffset: number;  // Character offset of anchor start in .md source (UTF-16)
  contextBefore: string; // ~40 chars of source immediately before the anchor
  contextAfter: string;  // ~40 chars of source immediately after the anchor
}
```

**Rationale**:
- `text` alone fails when the same phrase appears multiple times.
- `sourceOffset` alone fails when content above the anchor is inserted or deleted.
- The `contextBefore + contextAfter` fields enable fuzzy re-location: if the
  offset is stale, the extension searches for `contextBefore + text + contextAfter`
  as a substring of the updated file. This is the same approach used by the
  Hypothesis web annotator (TextQuote + TextPosition anchoring strategy) and by
  VS Code's built-in markdown preview (which uses `data-source-line` on block
  elements for scroll-sync).
- An additional optional `sourceLine` (1-based line number) may be stored as a
  fourth disambiguation hint; not required for MVP.

**Alternatives considered**:
- DOM character offset: rejected — DOM positions don't map to source positions
  after markdown-it rendering (e.g., `## Heading` source → `<h2>Heading</h2>` DOM).
- Line + column: rejected — line numbers shift on any insertion/deletion above the
  anchor; character offset + context is more robust.
- XPath / CSS selector: rejected — too brittle when HTML structure changes between
  renders (e.g., different markdown-it plugin output).

---

## Decision 2 — Offset Computation Location

**Question**: Where (webview or extension host) do we compute the source character
offset from a user's text selection?

**Decision**: Extension host only. The webview sends `selectedText` (rendered
string) and `occurrenceIndex` (how many times the same text appeared before the
selection in DOM order). The extension host calls
`TextDocument.getText().indexOf(selectedText, searchFrom)` iterating `occurrenceIndex`
times to find the correct source offset.

**Rationale**: The webview runs in a sandboxed iframe with no access to
`vscode.workspace.openTextDocument()`. DOM character offsets are useless for source
mapping. The `occurrenceIndex` is the one piece of positional data the webview CAN
compute correctly (by walking text nodes before the selection in DOM order), and it
is stable because rendered text order matches source order in well-formed markdown.

**Entity-encoding caveat**: `window.getSelection().toString()` returns rendered
text. HTML entities must be decoded before calling `indexOf()` in the source:
`&amp;→&`, `&lt;→<`, `&gt;→>`, `&quot;→"`, `&#39;→'`.

---

## Decision 3 — Webview ↔ Host Message Protocol for Selection

**Question**: What event triggers the comment form, and what data flows from
webview to host?

**Decision**: `mouseup` event (not `selectionchange`) in the webview. On `mouseup`,
if `window.getSelection()` is non-collapsed:

```javascript
vscode.postMessage({
  type: 'textSelected',
  selectedText: selection.toString().trim(),
  occurrenceIndex: computeOccurrenceIndex(selection, selectedText),
  rectTop: range.getBoundingClientRect().top + window.scrollY,
});
```

`rectTop` is the document-relative Y position of the selection's top edge — used
by the host to tell the webview where to render the comment input form in the gutter.

**Rationale**: `mouseup` fires once after selection is finalized. `selectionchange`
fires continuously on every cursor move, causing unnecessary round-trips.

---

## Decision 4 — Highlight Injection Strategy

**Question**: How do we visually highlight anchor text in the rendered preview
after comments are loaded or after a re-render?

**Decision**: Post-process the rendered HTML string in the extension host using
`node-html-parser` before sending it to the webview. For each comment, locate the
N-th occurrence of `anchor.text` in the HTML's text content (using the relocated
`sourceOffset` to determine N), then wrap it in:

```html
<mark class="comment-anchor" data-comment-id="{id}">{anchor.text}</mark>
```

Re-run on every render (file change, session restore, comment add/delete). The
webview is stateless — it only renders what the host sends.

**Rationale**: Keeps all state in the extension host. Webview JS need not manage
comment data. `node-html-parser` runs in the extension host (Node.js), requires no
DOM, and handles the split-tag edge case (e.g., wrapping text inside `<strong>`).

**Alternatives considered**:
- Inject highlights in webview JS via `window.getSelection()` DOM manipulation:
  rejected — requires the webview to maintain a synchronized copy of all comment
  data; increases message complexity; fragile on re-render.
- String replacement on raw HTML: rejected — `anchor.text` may span across HTML
  tags (e.g., selection including a bold word in a sentence); `node-html-parser`
  handles text-node–level injection correctly.

---

## Decision 5 — Markdown Renderer

**Decision**: `markdown-it` v14 with the built-in `table` rule enabled (on by
default in markdown-it ≥ 13). No additional plugins needed for the required render
targets (headings, bold, italic, lists, tables, blockquotes, code blocks, inline code).

Options used:

```javascript
const md = require('markdown-it')({
  html: false,      // Disable raw HTML in .md (XSS safety in webview)
  linkify: true,
  typographer: true,
});
```

**Rationale**: `markdown-it` is what VS Code itself uses internally for its built-in
markdown preview. It is the de-facto standard for VS Code extension markdown rendering.
GFM tables are enabled by default (no plugin needed). Disabling `html: true` prevents
injection of arbitrary HTML from user-authored `.md` files into the webview.

**Alternatives considered**:
- `marked`: rejected — less idiomatic for VS Code extensions; slightly slower.
- `@vscode/markdown-it-renderer`: rejected — internal VS Code API, not public/stable.
- `showdown`: rejected — older, less maintained.

---

## Decision 6 — Build Tooling

**Decision**: `esbuild` with two entry points:
1. `src/host/extension.ts` → `out/extension.js` (target: `node`, external: `vscode`)
2. `src/webview/main.ts` → `out/webview/main.js` (target: `browser`)

```javascript
// esbuild.js
const { build } = require('esbuild');
build({
  entryPoints: ['src/host/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
});
build({
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'out/webview/main.js',
  format: 'iife',
  platform: 'browser',
  sourcemap: true,
});
```

**Rationale**: esbuild is the standard for new VS Code extensions as of the 2024
Yeoman generator update. Sub-second rebuild times. No webpack config overhead.

---

## Decision 7 — Testing Strategy

**Decision**:
- Unit tests: `mocha` + `ts-node/esm` (or compile first to `out/`), run directly
  from CLI without a VS Code instance. Covers `src/core/` only.
- Integration tests: `@vscode/test-electron` + `mocha`, run in a VS Code test
  instance. Covers `src/host/` (TreeDataProvider, WebviewPanel).
- Webview: manual smoke tests only (VS Code webview iframes cannot be headlessly
  automated in CI without a full browser).

**CI setup**: Unit tests in `npm test:unit`; integration tests in `npm test:integration`
(requires display for Electron). CI runs unit tests on every push; integration tests
on PR only (or with `xvfb-run` on Linux CI).

**Rationale**: Constitution VI requires "tests run in CI without a VS Code instance"
for unit tests. `@vscode/test-electron` is still the authoritative integration test
runner for VS Code extensions (no replacement as of 2026).

---

## Decision 8 — Activation Events

**Decision**: Use specific activation events (VS Code 1.74+ recommended practice):

```json
"activationEvents": [
  "onView:comment-file-tree",
  "onLanguage:markdown",
  "onCommand:comment.review"
]
```

**Rationale**: The wildcard `*` is discouraged in VS Code 1.74+ (it eagerly
activates on every workspace open, degrading startup performance for other
extensions). `onView:comment-file-tree` activates when the sidebar view is opened.
`onLanguage:markdown` activates when any `.md` file is opened. `onCommand:comment.review`
ensures the review command is available even if neither of the above triggered first.

---

## Decision 9 — WebviewPanel vs CustomReadonlyEditorProvider

**Decision**: `vscode.window.createWebviewPanel()` in `ViewColumn.One`.

**Rationale**: Full control over the HTML/CSS/JS in the preview. No conflict with
VS Code's built-in markdown preview (which uses its own internal provider).
`CustomReadonlyEditorProvider` would intercept all `.md` file opens globally —
undesirable, as users may want to open `.md` files in both the standard text
editor and the comment preview simultaneously.

**Trade-off**: The `WebviewPanel` is not automatically the "active text editor"
(`window.activeTextEditor`), so we cannot use that API to detect which file is open
in the preview. We track the active preview file in a module-level variable in
`src/host/previewPanel.ts`, exposed via a getter for `src/host/commands.ts` to use.

---

## Decision 10 — Claude Review Integration Architecture

**Decision**: Dual-layer implementation:
1. `.claude/commands/comment.review.md` — a Claude Code slash command. When
   invoked, it instructs Claude to read the active `.md` file path (from the
   user's context or explicit argument), read its sidecar JSON, validate that
   comments exist, create the feedback file (write it to disk), produce a revised
   file addressing all comments, and present the edits as a diff.
2. `comment.review` VS Code command (command palette) — triggers the same flow
   from within VS Code: runs the pre-flight guard (no comments → show info
   message), creates the feedback file, then opens Claude Code's chat with the
   assembled review prompt pre-filled.

**Rationale**: The spec says users "switch to the Claude chat panel and type a
slash command." Claude Code slash commands in `.claude/commands/` are the natural
mechanism. The VS Code command provides an alternative entry point (command palette /
keyboard shortcut) that calls the same core logic. The feedback file creation (FR-013)
happens inside the core module before Claude is invoked — this is deterministic even
if the user invokes via the slash command directly (the command instructs Claude to
create the file as its first action).

**Sidecar clear after accepted review**: The extension watches the `.md` file for
saves. After the user accepts the diff and VS Code writes the updated file, the
extension's `FileSystemWatcher` fires, the extension checks whether the sidecar
exists and whether Claude's review has been committed (tracked via an in-memory
flag set when the review command runs), and clears the sidecar. This is the
simplest approach that doesn't require modifying VS Code's diff UI.

---

## All NEEDS CLARIFICATION Markers: Resolved

| # | Original question | Resolution |
|---|-------------------|------------|
| 1 | Anchor strategy for duplicate text | `occurrenceIndex` + four-field anchor (§D1, D2) |
| 2 | How to compute source offset from webview selection | Extension host with `indexOf` (§D2) |
| 3 | How to highlight anchor after re-render | `node-html-parser` post-processing in host (§D4) |
| 4 | Which markdown renderer | `markdown-it` v14 (§D5) |
| 5 | Build tooling | esbuild, two entry points (§D6) |
| 6 | Test strategy for CI | Mocha for unit, `@vscode/test-electron` for integration (§D7) |
| 7 | WebviewPanel vs CustomReadonlyEditorProvider | WebviewPanel (§D9) |
| 8 | Claude review command architecture | Dual-layer: slash command + VS Code command (§D10) |
| 9 | Active-file detection for review command | Module-level tracking in `previewPanel.ts` (§D9) |
| 10 | Sidecar clear after accepted diff | `FileSystemWatcher` + in-memory flag (§D10) |
