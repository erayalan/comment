# Tasks: Inline Markdown Comment & Claude Review

**Feature**: `001-md-comments`
**Branch**: `001-md-comments`
**Input**: Design documents from `specs/001-md-comments/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking cross-dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths included in every task description

---

## Phase 1: Setup (Extension Scaffold)

**Purpose**: Initialize the VS Code extension project with all tooling and directory structure.

- [X] T001 Scaffold VS Code extension using `yo code` (TypeScript, esbuild bundler, no git init) generating package.json, tsconfig.json, esbuild.js, src/extension.ts at repo root
- [X] T002 Configure package.json with full extension manifest: name `comment`, publisher field, `engines.vscode "^1.74.0"`, `activationEvents` (`onView:comment-file-tree`, `onLanguage:markdown`, `onCommand:comment.review`), `contributes.viewsContainers` (activitybar with icon), `contributes.views.comment-file-tree`, `contributes.commands` placeholder
- [X] T003 [P] Reorganize src/ into src/core/, src/host/, src/webview/ per plan.md structure; delete generator-created src/extension.ts (it will be recreated as src/host/extension.ts)
- [X] T004 [P] Update tsconfig.json: `strict true`, `target ES2020`, `module NodeNext`, `moduleResolution NodeNext`, `outDir out/`, `rootDir src/`
- [X] T005 [P] Update esbuild.js with two entry points: `src/host/extension.ts → out/extension.js` (platform node, external `vscode`, format cjs, sourcemap true) and `src/webview/main.ts → out/webview/main.js` (platform browser, format iife, sourcemap true)
- [X] T006 [P] Create .vscodeignore excluding src/, specs/, tests/, .specify/, .claude/, node_modules/, esbuild.js, *.test.ts, tsconfig.json, .eslintrc.json

---

## Phase 2: Foundational (Core Types)

**Purpose**: Canonical TypeScript type definitions used by every core and host module. No user story work can begin until this is complete.

**⚠️ CRITICAL**: All of `src/core/` and `src/host/` import from this file.

- [X] T007 Implement `CommentAnchor`, `Comment`, `Sidecar`, `FeedbackFileResult` interface definitions in src/core/types.ts per data-model.md "TypeScript Type Definitions (Canonical)" section

**Checkpoint**: src/core/types.ts compiles cleanly and exports all four interfaces — user story phases can now begin.

---

## Phase 3: User Story 1 — Browse and Open Markdown Files (Priority: P1) 🎯 MVP

**Goal**: Sidebar with `.md`-only file tree; click to open markdown-rendered preview in editor area; auto-refresh within 3 seconds of file change.

**Independent Test**: Press F5, open a workspace with `.md` and non-`.md` files, click the Comment icon in the Activity Bar — only `.md` files and their ancestor folders appear; clicking a file renders the markdown content in a preview panel that refreshes automatically on save.

### Implementation for User Story 1

- [X] T008 [US1] Implement `MarkdownFileTree` class (`TreeDataProvider<MarkdownItem>`) filtering workspace root to `.md` files and ancestor directories only; attach `FileSystemWatcher` on `**/*.md` to fire `onDidChangeTreeData` in src/host/fileTree.ts
- [X] T009 [US1] Implement `buildWebviewHtml(nonce, bodyHtml, webviewCssUri, webviewJsUri): string` returning full HTML page with strict CSP meta tag (`default-src 'none'; script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'; img-src vscode-resource: https:`) and two-column body structure (`#preview` + `#gutter`) in src/host/previewPanel.ts
- [X] T010 [US1] Implement `renderMarkdown(mdSource: string): string` using `markdown-it` v14 with `{ html: false, linkify: true, typographer: true }` options in src/host/previewPanel.ts
- [X] T011 [US1] Implement `CommentPreviewPanel` class: static `createOrShow(context)`, `handleMessage(msg)` dispatcher, `sendSetFileContent(html, filePath)`, `FileSystemWatcher` triggering re-render within 3 seconds on file change, module-level `activeFilePath` getter for use by commands in src/host/previewPanel.ts
- [X] T012 [US1] Implement webview JS entry point: on `DOMContentLoaded` send `{ type: 'ready' }` via `vscode.postMessage()`; set up `window.addEventListener('message', dispatch)` skeleton with empty `setFileContent` and `renderComments` handlers in src/webview/main.ts
- [X] T013 [US1] Add two-column CSS layout (`#preview` 70% left, `#gutter` 30% right, `position: relative`), base typography, and markdown element styles (headings, code blocks, tables, blockquotes) in src/webview/styles.css
- [X] T014 [US1] Implement `activate(context: vscode.ExtensionContext)` and `deactivate()` in src/host/extension.ts: register `MarkdownFileTree` as `TreeDataProvider` for `comment-file-tree` view; register `comment.openPreview` command calling `CommentPreviewPanel.createOrShow()`; push all disposables to `context.subscriptions`
- [X] T015 [US1] Add integration test skeleton for `MarkdownFileTree`: verify `.md` files appear in tree, non-`.md` files are hidden, `getChildren()` returns correct items in tests/integration/fileTree.test.ts

**Checkpoint**: F5 launches extension; Activity Bar shows Comment icon; sidebar lists only `.md` files; clicking a file opens rendered preview; editing the file refreshes the preview within 3 seconds.

---

## Phase 4: User Story 2 — Add an Inline Comment on Selected Text (Priority: P2)

**Goal**: Text selection in preview → comment form → comment persisted to sidecar → visual `<mark>` highlight + gutter card; delete with confirm; session persistence across editor restarts.

**Independent Test**: Open a `.md` file in the preview, highlight any text, write and submit a comment — the text is highlighted and a gutter card appears. Close VS Code completely, reopen and open the same file — the comment is still there, anchored to the same text. Delete the comment — it disappears permanently with no undo.

### Implementation for User Story 2

- [X] T016 [P] [US2] Implement `createComment(anchor: CommentAnchor, body: string): Comment` (uuid v4 id, ISO 8601 createdAt), `deleteComment(sidecar: Sidecar, id: string): Sidecar`, `findComment(sidecar: Sidecar, id: string): Comment | undefined` in src/core/comment.ts
- [X] T017 [P] [US2] Implement three-pass anchor relocation: (1) exact `sourceOffset` char match, (2) `contextBefore + text + contextAfter` substring search, (3) overlap scoring against all occurrences; export `relocateAnchor(source: string, anchor: CommentAnchor): number` (returns -1 if not found) in src/core/anchor.ts
- [X] T018 [P] [US2] Implement `readSidecar(path: string): Promise<Sidecar>` (return empty sidecar on absent/corrupt, log warning per dropped invalid comment entry), `writeSidecar(path, sidecar): Promise<void>` (atomic: write to `{path}.tmp` then `fs.rename`), `clearSidecar(path): Promise<void>` in src/core/sidecar.ts
- [X] T019 [US2] Implement `injectHighlights(html: string, comments: Comment[], source: string): string` using `node-html-parser` to wrap the N-th text-node occurrence of `anchor.text` (N from `relocateAnchor`) in `<mark class="comment-anchor" data-comment-id="{id}">{anchor.text}</mark>`; re-run on every render in src/host/previewPanel.ts
- [X] T020 [US2] Implement selection-to-comment trigger in webview via two paths in src/webview/main.ts: (1) drag — `mousedown`/`mousemove`/`mouseup` listeners set a drag flag after ≥4px displacement and call `_processSelection()` on release; (2) double-click — `dblclick` listener on `#preview` calls `_processSelection()`. Shared `_processSelection()` helper guards: selection must be non-collapsed, both range endpoints must be within `#preview`, selection must not partially overlap or span an existing `mark.comment-anchor` (cross-element text can't be resolved). Computes `occurrenceIndex` (DOM text-node order count), sends `textSelected` with `selectedText`, `occurrenceIndex`, `rectTop`, `rectLeft`. Keyboard-based selection is intentionally ignored.
- [X] T021 [US2] Implement `textSelected` message handler in `CommentPreviewPanel`: decode HTML entities (`&amp;→&` etc.), call `TextDocument.getText().indexOf(selectedText, from)` iterating `occurrenceIndex` times to find `sourceOffset`, extract `contextBefore`/`contextAfter` (40 chars each), generate `pendingAnchorId` (uuid), send `showCommentForm` back to webview in src/host/previewPanel.ts
- [X] T022 [US2] Implement `showCommentForm` message handler in webview: inject a comment input card into `#gutter` positioned at `rectTop`, show `anchorPreview` header ("Commenting on: …"), `<textarea>` for body, Submit and Cancel buttons; Escape key triggers Cancel; Cancel sends `cancelComment` message in src/webview/main.ts
- [X] T023 [US2] Implement `submitComment` message handler in host: validate `body.trim().length > 0`, call `createComment()`, `writeSidecar()`, re-render HTML with `injectHighlights()`, send `setFileContent` + `renderComments`; implement `cancelComment` handler to discard `pendingAnchor` in src/host/previewPanel.ts
- [X] T024 [US2] Implement `deleteComment` message handler in host: call `deleteComment()` on sidecar, `writeSidecar()`, re-render and send `setFileContent` + `renderComments`; implement delete button in each gutter card with an inline confirmation step before sending `deleteComment` message in src/webview/main.ts and src/host/previewPanel.ts
- [X] T025 [US2] Implement `renderComments` message handler in webview: render one gutter card per `GutterComment`, position at `comment.rectTop` using `position: absolute`, display orphaned comments (`rectTop === -1 || isOrphaned`) at bottom of gutter with a visual "Anchor not found" label; order visible cards by vertical position. Attach a `ResizeObserver` on `#preview` that re-runs `_renderGutter(_lastComments)` whenever the preview width changes, keeping cards aligned after text reflow caused by window resize in src/webview/main.ts
- [X] T026 [US2] Add unit tests for `createComment` (id is uuid, createdAt is ISO 8601), `deleteComment` (removes correct comment, returns new sidecar), `findComment` (found/not-found), empty-body guard in tests/unit/comment.test.ts
- [X] T027 [US2] Add unit tests for `relocateAnchor`: exact offset hit, stale-offset context fallback, overlap scoring with duplicate anchor text, anchor-not-found returns -1 in tests/unit/anchor.test.ts
- [X] T028 [US2] Add unit tests for `readSidecar` (absent → empty sidecar, invalid JSON → empty + logs warning, valid → loaded, invalid comment entries dropped), `writeSidecar` (atomic write verified by stat), `clearSidecar` (writes `{ version: 1, comments: [] }`) in tests/unit/sidecar.test.ts

**Checkpoint**: Comments survive full VS Code restart, highlights appear on correct text after re-render, delete is permanent, multiple comments display ordered by vertical position, orphaned comments show fallback indicator.

---

## Phase 5: User Story 3 — Copy and Save Comments for AI Review (Priority: P3)

**Goal**: "Copy & Save Comments" button at the bottom of the sidebar scans all `.md` files in the workspace that have comments, assembles a structured prompt (file name → full document content → each anchor + comment body per file), copies it to the clipboard, and writes it to `CommentRevisions/Revision-R{N}.md` at the workspace root; revision numbers increment on each click; works with any AI tool.

**Independent Test**: Add comments to two different `.md` files. Click "Copy & Save Comments". Paste clipboard into any AI chat — prompt contains both files' names, full content, and each comment. Open `CommentRevisions/Revision-R1.md` — matches clipboard exactly. Click again — `Revision-R2.md` is created, `Revision-R1.md` untouched. Click with no comments anywhere — info message shown, no file written.

### Implementation for User Story 3

- [X] T029 [US3] Implement `assembleReviewPrompt(files: Array<{ filename: string; content: string; comments: Comment[] }>): string` in src/core/prompt.ts: for each file emit `# File: {filename}\n\n{full content}\n\n## Comments\n` followed by each comment as `**Anchor:** {anchor.text}\n**Comment:** {body}\n`; files separated by `\n---\n`
- [X] T030 [US3] Implement `getNextRevisionNumber(revisionsDir: string): Promise<number>` in src/core/revision.ts: scan `revisionsDir` for files matching `Revision-R*.md`, extract all N values via regex, return `max(N) + 1` or `1` if none exist
- [X] T031 [US3] Implement `writeRevisionFile(revisionsDir: string, content: string): Promise<{ path: string; revisionNumber: number }>` in src/core/revision.ts: `mkdir -p revisionsDir`, compute N via `getNextRevisionNumber`, target path `Revision-R{N}.md`, collision guard (if file exists append `_{YYYYMMDDHHmmss}` before `.md`), write file atomically (`{path}.tmp` then `fs.rename`), return `{ path, revisionNumber: N }`
- [X] T032 [US3] Implement `copyAndSave` command handler in src/host/commands.ts: enumerate all sidecar files in workspace via `vscode.workspace.findFiles('**/.*.comments.json')`, for each non-empty sidecar `readSidecar()` + `fs.readFile` the corresponding `.md`, guard if zero files have comments (`vscode.window.showInformationMessage('No comments found')`), call `assembleReviewPrompt()`, write to `CommentRevisions/` via `writeRevisionFile()` (show `showErrorMessage` and return if write fails), copy to clipboard via `vscode.env.clipboard.writeText()`, show `showInformationMessage` with revision file path
- [X] T033 [US3] Register `comment.copyAndSave` command in `activate()` in src/host/extension.ts; add `{ command: "comment.copyAndSave", title: "Comment: Copy & Save Comments" }` to `contributes.commands` in package.json; wire the sidebar "Copy & Save Comments" button to this command via a `contributes.menus` `view/title` entry for `comment-file-tree` view
- [X] T034 [US3] Add unit tests for `assembleReviewPrompt` (single file with one comment produces correct headings and content; multi-file output has `---` separator; file with no comments is excluded; empty input returns empty string) and `getNextRevisionNumber` (no prior files → 1, R1 exists → 2, R1+R3 exist → 4) in tests/unit/prompt.test.ts and tests/unit/revision.test.ts

**Checkpoint**: Clicking "Copy & Save Comments" with comments copies a correctly structured multi-file prompt to clipboard and creates `CommentRevisions/Revision-R1.md`; second click creates `R2`; clicking with no comments shows info message only.

---

## Phase 6: User Story 4 — Delete All Comments (Priority: P4)

**Goal**: "Delete All Comments" button at the bottom of the sidebar shows a confirmation dialog, then on confirm clears every sidecar file in the workspace and refreshes the preview immediately.

**Independent Test**: Add comments to multiple `.md` files. Click "Delete All Comments", dismiss the dialog — nothing changes. Click again and confirm — all highlights and gutter cards vanish across all files. Reopen the editor — no comments remain.

### Implementation for User Story 4

- [X] T035 [US4] Implement `deleteAllComments` command handler in src/host/commands.ts: show `vscode.window.showWarningMessage` with text `"Do you really want to delete all your comments in all your files? Make sure to Copy and Save your Comments first."` and buttons `["Delete All", "Cancel"]`; if user picks Cancel return immediately; enumerate all sidecar files via `vscode.workspace.findFiles('**/.*.comments.json')`, call `clearSidecar()` on each; call `CommentPreviewPanel.refresh()` to re-render the active preview with no comments
- [X] T036 [US4] Register `comment.deleteAllComments` command in `activate()` in src/host/extension.ts; add `{ command: "comment.deleteAllComments", title: "Comment: Delete All Comments" }` to `contributes.commands` in package.json; wire the sidebar "Delete All Comments" button via a second `contributes.menus` `view/title` entry for `comment-file-tree`
- [X] T037 [US4] Add unit tests for `deleteAllComments` logic: confirm path calls `clearSidecar` on all found sidecar paths; cancel path calls `clearSidecar` zero times in tests/unit/deleteAll.test.ts

**Checkpoint**: Clicking "Delete All Comments" and canceling leaves all sidecars untouched; confirming clears all sidecars and the active preview refreshes with no highlights or gutter cards.

---

## Phase 6b: User Story 5 — Delete a Single Revision File (Priority: P5)

**Goal**: Trash icon appears on hover over each revision row in the Revision History panel. Clicking it opens a native confirmation dialog. On confirm, the file is deleted and the panel refreshes automatically via the existing file watcher.

**Independent Test**: Generate two revisions. Hover a row — trash icon appears. Click trash, cancel — file untouched. Click trash, confirm — file deleted, panel updates. Second revision unaffected.

### Implementation for User Story 5

- [X] T038 [US5] Add `contextValue = 'revisionItem'` to `RevisionItem` in src/host/revisionsTree.ts; implement `deleteRevision(item: { filePath: string })` in src/host/commands.ts using `vscode.window.showWarningMessage` with `{ modal: true }` and a single `'Delete'` button (VS Code adds Cancel automatically); register `comment.deleteRevision` command in src/host/extension.ts; add command with `$(trash)` icon to `contributes.commands` and a `view/item/context` inline menu entry scoped to `viewItem == revisionItem` in package.json

**Checkpoint**: Hover over a revision row — trash icon appears right of filename. Click trash → native modal with Delete + Cancel. Cancel → no change. Delete → file removed, tree refreshes.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Integration test runner, build validation, packaging, and manual smoke-test sign-off.

- [ ] T040 [P] Add integration test for `CommentPreviewPanel`: verify `createOrShow()` creates a WebviewPanel, `ready` message triggers `setFileContent` dispatch in tests/integration/previewPanel.test.ts
- [ ] T041 [P] Configure npm test scripts in package.json: `"test:unit": "mocha --require ts-node/register 'tests/unit/**/*.test.ts'"`, `"test:integration": "node out/test/runTest.js"`, `"test": "npm run test:unit && npm run test:integration"`, `"lint": "eslint src --ext ts"`
- [ ] T042 [P] Add ESLint configuration (.eslintrc.json) with `@typescript-eslint/recommended`, `no-unused-vars`, `no-explicit-any` rules; add `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` to devDependencies in package.json
- [X] T043 [P] Run `npm run compile` and verify `out/extension.js` and `out/webview/main.js` are produced with zero TypeScript errors; fix any type errors surfaced by strict mode
- [ ] T044 Run `npm run package` to produce `comment-{version}.vsix`; install via `code --install-extension comment-{version}.vsix`; execute full quickstart.md manual smoke test (sidebar → file tree → preview → text selection → comment submit → session restore → review command → accept diff)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T001–T006 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on T007 — independently testable after completion
- **US2 (Phase 4)**: Depends on US1 (extends previewPanel.ts and webview/main.ts established in US1)
- **US3 (Phase 5)**: Depends on US2 (needs sidecar I/O, comment CRUD; reads all sidecars workspace-wide)
- **US4 (Phase 6)**: Depends on US2 (needs `clearSidecar` and sidecar enumeration established in US2)
- **Polish (Phase 7)**: Depends on all desired stories being complete

### User Story Dependencies

| Story | Depends On | Reason |
|-------|-----------|--------|
| US1 (P1) | Phase 2 only | Entry point — no story dependencies |
| US2 (P2) | US1 | Extends previewPanel.ts and webview/main.ts from US1 |
| US3 (P3) | US2 | Needs sidecar I/O and comment types; reads all workspace sidecars |
| US4 (P4) | US2 | Needs `clearSidecar` — independent of US3 |

### Within US2 (ordered)

1. **T016, T017, T018** `[P]` — core modules in different files, no cross-dependencies
2. **T019** — highlight injection (depends on T017 relocation + T018 sidecar read)
3. **T020** — webview drag-to-highlight handler (can start alongside T019 — different concern)
4. **T021** — host `textSelected` handler (depends on T017 relocation algorithm)
5. **T022** — comment form in webview (depends on T020 selection handler)
6. **T023** — submit/cancel flow (depends on T019 render pipeline + T021 + T022)
7. **T024** — delete flow (depends on T023 pattern)
8. **T025** — `renderComments` webview handler (depends on T022 gutter structure)
9. **T026, T027, T028** `[P]` — unit tests (parallel, different test files)

### Parallel Opportunities

| Phase | Parallel group |
|-------|---------------|
| Phase 1 | T003, T004, T005, T006 (after T001 scaffolds the project) |
| Phase 3 | T008, T012 (different files); T009, T010 are sequential (same file); T013, T015 (different files, after T009/T010) |
| Phase 4 | T016, T017, T018; then T026, T027, T028 |
| Phase 7 | T040, T041, T042, T043 |

---

## Parallel Example: User Story 2

```bash
# Step 1 — launch all three core modules in parallel (different files):
Task: "T016 [P] [US2] Implement comment CRUD in src/core/comment.ts"
Task: "T017 [P] [US2] Implement anchor relocation in src/core/anchor.ts"
Task: "T018 [P] [US2] Implement sidecar I/O in src/core/sidecar.ts"

# Step 2 — once T017 + T018 complete:
Task: "T019 [US2] Implement highlight injection in src/host/previewPanel.ts"

# Step 3 — T019 + T021 complete, then:
Task: "T023 [US2] Implement submitComment/cancelComment in src/host/previewPanel.ts and src/webview/main.ts"

# Step 4 — once core modules (T016–T018) are done, run unit tests in parallel:
Task: "T026 [P] [US2] Unit tests for src/core/comment.ts in tests/unit/comment.test.ts"
Task: "T027 [P] [US2] Unit tests for src/core/anchor.ts in tests/unit/anchor.test.ts"
Task: "T028 [P] [US2] Unit tests for src/core/sidecar.ts in tests/unit/sidecar.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T006)
2. Complete Phase 2: Foundational (T007)
3. Complete Phase 3: User Story 1 (T008–T015)
4. **STOP and VALIDATE**: F5 → Activity Bar icon → sidebar shows `.md` tree → click file → preview renders → edit file → auto-refresh within 3 s
5. Demonstrate: lightweight markdown preview browser — value without any comments

### Incremental Delivery

1. Setup + Foundational → extension scaffolded with types
2. **US1** → markdown preview browser **(MVP demo-able)**
3. **US2** → full annotation workflow — comment, persist, delete, restore across sessions
4. **US3** → Claude review integration — comments become actionable edits
5. **US4** → feedback archiving — full review history preserved permanently
6. Polish → integration tests, lint, package, smoke-test sign-off

---

## Notes

- `[P]` means the task touches a different file from its parallel siblings with no blocking cross-dependency at the time it runs
- US2–US4 intentionally extend US1 infrastructure rather than being fully independent (this is inherent to a layered extension — each story adds a capability tier)
- Unit tests cover `src/core/` only (no VS Code instance needed, safe for CI); integration tests cover `src/host/` (requires Electron via `@vscode/test-electron`)
- Webview interaction (selection, form, gutter) is covered by quickstart.md manual smoke testing — webview iframes cannot be headlessly automated without a full browser
- Commit after each phase checkpoint to preserve a working, independently demonstrable state
- The `comment.review` VS Code command (T030) and Claude Code slash command (T032) implement the same contract (`claude-command-spec.md`) via different entry points; both must behave identically per that contract
