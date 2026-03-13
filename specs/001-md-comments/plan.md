# Implementation Plan: Inline Markdown Comment & Claude Review

**Branch**: `001-md-comments` | **Date**: 2026-02-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-md-comments/spec.md`

***

## Summary

Build a VS Code extension that lets writers add Google Docs–style inline comments to
`.md` files. The extension provides: a sidebar file browser (`.md` files only), a
rich-text preview panel with text-selection–driven comment creation, a right-side
comment gutter with persistent sidecar JSON storage, and a `/comment.review` Claude
Code slash command that archives a feedback snapshot,:comment[passes the file]{#comment-1772217842364 text="qfwqfe"} + comments to
Claude, and presents the proposed edits as a diff for user approval.

**Tech approach**: TypeScript VS Code extension with a strict core/host separation.
Core logic (comment CRUD, anchor resolution, sidecar I/O, feedback archiving, prompt
assembly) lives in a platform-agnostic `src/core/` module. The VS Code host layer
(`src/host/`) is a thin adapter. The webview frontend (`src/webview/`) handles
text selection, comment display, and highlight injection.

***

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 18+, VS Code extension host)
**Primary Dependencies**:

* `vscode` API 1.74+ (WebviewView, WebviewPanel, TreeDataProvider, FileSystemWatcher)
* `markdown-it` ^14 + `markdown-it-anchor` (markdown rendering in webview)
* `node-html-parser` ^6 (post-process rendered HTML to inject `<mark>` highlights)
* `uuid` ^9 (comment ID generation, platform-agnostic)
* `esbuild` (bundling — standard for VS Code extensions since generator v1.74)

**Storage**: Sidecar JSON files (`.{filename}.comments.json`) on local disk, managed
by `src/core/sidecar.ts`; no database.
**Testing**: `mocha` + `ts-node` for unit tests (no VS Code instance needed for core
logic); `@vscode/test-electron` + `mocha` for integration tests.
**Target Platform**: VS Code 1.74+ and VS Code-based forks (Cursor, Windsurf); macOS,
Windows, Linux.
**Project Type**: VS Code extension (`.vsix` package, published to VS Code Marketplace).
**Performance Goals**: Preview refresh within 3 seconds of file change (FR-004);
comment submission and anchor display within 500 ms of submit action.
**Constraints**: Local filesystem only (no virtual FS, no remote workspaces in MVP);
single-user; no internet access required at runtime (Claude integration is via the
existing Claude Code context, not a network call from the extension itself).
**Scale/Scope**: Single workspace, unbounded number of `.md` files; comments per file
expected in the low tens (MVP does not optimize for 1000+ comments per file).

***

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle                             | Gate                                                                                                                                                   | Status | Notes                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------- |
| **I. Markdown-First**                 | Sidebar shows `.md` files only; no other file type surfaced or annotated                                                                               | ✅ PASS | `TreeDataProvider` filters to `.md` files; sidebar tree hides all other types           |
| **II. Sidecar Persistence**           | Comments stored in `.{filename}.comments.json`; `id`, `anchor`, `text`, `createdAt` present; sidecar cleared (not deleted) on accepted review          | ✅ PASS | `src/core/sidecar.ts` owns all reads/writes/clears; schema includes all required fields |
| **III. VS Code Native, IDE-Portable** | Core logic (CRUD, anchor, sidecar, feedback, prompt) has NO `vscode` imports; VS Code code is a thin host layer only                                   | ✅ PASS | `src/core/` has zero `vscode` imports; `src/host/` is the sole VS Code adapter          |
| **IV. Claude as the Editor**          | Review command: (1) creates feedback file, (2) passes content+comments to Claude, (3) presents diff; no auto-apply; aborts with message if no comments | ✅ PASS | Command order enforced in `src/host/commands.ts`; abort guard in `src/core/review.ts`   |
| **V. Simplicity First**               | Flat comments only; single-user; permanent delete; review archives permitted; YAGNI on data structures                                                 | ✅ PASS | No threads, replies, or resolution status in data model; comment schema is minimal      |
| **VI. Test-Alongside**                | Tests written during implementation; core paths covered; webview/manual exempt; CI runs without VS Code instance for unit tests                        | ✅ PASS | `tests/unit/` uses pure mocha; `tests/integration/` uses `@vscode/test-electron`        |

**Gate result**: ALL PASS — proceed to Phase 0.

***

## Project Structure

### Documentation (this feature)

```text
specs/001-md-comments/
├── plan.md              # This file
├── research.md          # Phase 0: resolved decisions
├── data-model.md        # Phase 1: entity schemas, state transitions
├── quickstart.md        # Phase 1: dev setup
├── contracts/
│   ├── webview-messages.md       # Host ↔ webview message protocol
│   ├── sidecar-schema.md         # JSON schema for .comments.json
│   └── claude-command-spec.md    # /comment.review command definition
└── tasks.md             # Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
package.json             # VS Code extension manifest + npm scripts
tsconfig.json            # TypeScript config (strict, ES2020 target)
esbuild.js               # Build script (extension + webview bundles)
.vscodeignore            # Files excluded from .vsix package

src/
├── core/                # Platform-agnostic — zero vscode imports
│   ├── types.ts         # Comment, CommentAnchor, Sidecar, FeedbackFile types
│   ├── comment.ts       # CRUD operations on in-memory comment arrays
│   ├── anchor.ts        # Anchor computation, relocation, fuzzy re-match
│   ├── sidecar.ts       # Read/write/clear sidecar JSON files (uses fs/promises)
│   ├── feedback.ts      # Feedback file creation, revision numbering
│   └── prompt.ts        # Assemble Claude review prompt from file + comments
├── host/                # VS Code-specific thin adapter layer
│   ├── extension.ts     # activate() / deactivate() — entry point
│   ├── fileTree.ts      # TreeDataProvider: .md-only sidebar tree
│   ├── previewPanel.ts  # WebviewPanel: markdown preview + comment gutter
│   └── commands.ts      # VS Code command registrations (review, delete, etc.)
└── webview/             # Webview frontend (bundled separately by esbuild)
    ├── main.ts          # Entry: selection listener, comment form, gutter render
    └── styles.css       # Preview + gutter styles

.claude/commands/
└── comment.review.md    # Claude Code slash command definition

tests/
├── unit/                # Pure mocha — no VS Code instance required
│   ├── anchor.test.ts
│   ├── comment.test.ts
│   ├── sidecar.test.ts
│   ├── feedback.test.ts
│   └── prompt.test.ts
└── integration/         # @vscode/test-electron
    ├── fileTree.test.ts
    └── previewPanel.test.ts
```

**Structure Decision**: Single-project layout (Option 1 from template). The
extension is one deployable unit; the `core/host/webview` split is a logical
separation within a single package, not separate npm workspaces. The webview
bundle is built as a second esbuild entry point targeting a browser environment.

***

## Implementation Phases

### Phase 1 — File Browser + Preview (US1)

**Goal**: Sidebar with `.md`-only file tree; click to open rich-text preview in
editor area; auto-refresh within 3 seconds of file change.

**Deliverables**:

* `package.json` with activity bar icon, `viewsContainers`, `views`, activation
  events (`onView:comment-file-tree`, `onLanguage:markdown`)
* `src/host/fileTree.ts`: `TreeDataProvider` filtering workspace to `.md` files
  and ancestor directories only
* `src/host/previewPanel.ts`: `WebviewPanel` (column One) rendering markdown-it
  HTML; `FileSystemWatcher` triggers re-render within 3 s
* `src/webview/main.ts`: base skeleton, CSP-safe HTML template

### Phase 2 — Inline Comments (US2)

**Goal**: Text selection → comment form → comment persisted to sidecar → visual
highlight + gutter display; delete with confirm; session persistence.

**Deliverables**:

* `src/core/types.ts`, `src/core/comment.ts`, `src/core/anchor.ts`,
  `src/core/sidecar.ts` — full core module
* Webview layout: a single `#canvas` scroll container wraps both `#preview` (70%)
  and `#gutter` (30%) so both columns share one scroll context; comment cards are
  `position: absolute` within `#gutter` at canvas-document Y coordinates, keeping
  them aligned with their anchor marks throughout scroll without any scroll-sync
  logic. The gutter background is painted as a CSS gradient on `#canvas` so it
  extends the full scroll height regardless of card count.
* Webview: drag-to-highlight detection (`mousedown`/`mousemove`/`mouseup` with
  4 px displacement threshold; double-click and keyboard selection ignored),
  `postMessage` to host, comment form injection, gutter render with collision
  avoidance (cards sorted by document Y then left-to-right X; each card placed at
  `max(naturalTop, previousCardBottom + 4px)`; comment form applies identical
  avoidance against existing cards before placement), highlight injection via
  `node-html-parser`
* `tests/unit/` coverage for anchor, comment, sidecar modules

### Phase 3 — Claude Review Command (US3)

**Goal**: `/comment.review` (Claude Code command + VS Code command) reads active
file + sidecar, passes to Claude, shows diff for approval, clears sidecar on
accept.

**Deliverables**:

* `src/core/prompt.ts` — assemble review prompt
* `src/host/commands.ts` — `comment.review` VS Code command that detects
  no-comments guard and calls core prompt assembly
* `.claude/commands/comment.review.md` — slash command definition
* Sidecar clear-on-accept hook (extension listens for file save after diff accept)
* `tests/unit/prompt.test.ts`

### Phase 4 — Feedback Archiving (US4)

**Goal**: Before invoking Claude, write versioned `Feedback/{name}_feedback_R{N}.md`;
never overwrite existing feedback files.

**Deliverables**:

* `src/core/feedback.ts` — revision numbering, feedback file format
* Integration into Phase 3 review command flow (step 1: archive, step 2: prompt)
* `tests/unit/feedback.test.ts`

***

## Key Design Decisions

### D1 — Anchor Strategy: Text + Source Offset + Context

Chosen: `{ text, sourceOffset, contextBefore, contextAfter }` (see `research.md`
§1). The webview detects intentional text highlighting via a drag gesture (mousedown →
mousemove ≥4 px → mouseup); double-click and keyboard selection are explicitly
ignored. On confirmed drag-release, it sends `selectedText` and `occurrenceIndex`
(count of same text before selection in DOM order). The extension host maps this
to a source character offset via `TextDocument.getText().indexOf()`. Fuzzy re-location on re-render uses
a three-pass algorithm: exact offset → context string match → overlap scoring.

This satisfies the spec's edge case: "if the document is later edited and the
position shifts, the extension re-matches to the nearest occurrence."

### D2 — Highlight Injection via node-html-parser (Extension Host)

Chosen: render markdown-it HTML in extension host, post-process with
`node-html-parser` to wrap anchor text in `<mark data-comment-id="...">`, then
send annotated HTML to webview. Re-run on every render. This keeps the webview
stateless with respect to comments — it only renders what the host sends.

Alternative rejected: injecting highlights in webview JS. Would require the webview
to manage comment state, making the webview-to-host state sync more complex.

### D3 — WebviewPanel for Preview (not CustomReadonlyEditorProvider)

Chosen: `vscode.window.createWebviewPanel()` opened in `ViewColumn.One`. Simpler
API, full control over HTML, no conflict with VS Code's own markdown preview.

Alternative rejected: `CustomReadonlyEditorProvider`. Requires registering a
custom editor that intercepts `.md` file opens globally — would conflict with the
user's existing markdown editor setup and VS Code's built-in preview.

### D4 — Claude Review as Claude Code Slash Command

Chosen: `.claude/commands/comment.review.md` — a Claude Code command that
instructs Claude to read the active `.md` file and its sidecar, validate that
comments exist, create the feedback file, produce a revised file, and present it
as a diff. The VS Code extension also registers a `comment.review` command (for
the command palette) that triggers pre-flight (no-comments guard, feedback file
creation) and then opens the Claude chat with the file context.

Alternative rejected: HTTP call from extension to Claude API. Would require API
key management and bypass the user's existing Claude Code session/context.

### D5 — esbuild for Bundling

Chosen: two esbuild entry points — `src/host/extension.ts` targeting `node`
(VS Code extension host) and `src/webview/main.ts` targeting `browser` (webview
iframe). Fast, simple, no webpack config overhead.

***

## Complexity Tracking

> No constitution violations. Table omitted per template instructions.