# Feature Specification: Inline Markdown Comment & Claude Review

**Feature Branch**: `001-md-comments`
**Created**: 2026-02-26
**Status**: Draft
**Input**: User description: "VS Code extension for leaving Google Docs and Word-like inline
comments on .md files, with a slash command to have Claude read the comments and refine
the file. Users see a sidebar with folders and .md files only, click to open in rich-text
preview, highlight text to add a simple text comment on the right side, submit or delete
comments. Comments stored as sidecar JSON files next to each .md file."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and Open Markdown Files (Priority: P1)

A writer opens their project in their editor, clicks the Comment extension icon in the
activity bar, and sees two sections in the sidebar: a tree of their workspace's folders
and `.md` files, and a **Revision History** section listing any previously saved revision files.
They click a file and it opens in a rich-text reading view inside the extension panel,
rendered just like a document viewer.

**Why this priority**: This is the entry point to everything else. Without a working file
browser and preview, no other story is possible. It is the thinnest slice that proves the
extension is alive and useful.

**Independent Test**: Install the extension, open a workspace with at least one `.md` file,
open the Comment sidebar — the file tree appears and clicking a file shows rendered markdown.
The Revisions section is also visible (empty until the first revision is saved).
This delivers value on its own as a lightweight markdown preview browser.

**Acceptance Scenarios**:

1. **Given** a workspace with `.md` and non-`.md` files, **When** the user opens the Comment
   sidebar, **Then** the **Markdown Files** section shows only folders (that contain `.md`
   files) and `.md` files; the `CommentRevisions/` folder, hidden files, `node_modules`,
   and all non-`.md` file types are excluded.

2. **Given** the Comment sidebar is open, **When** the user clicks a `.md` file, **Then** the
   file opens in a rich-text preview panel that renders headings, bold, italic, lists, tables,
   blockquotes, and code blocks correctly.

3. **Given** a `.md` file is open in the preview, **When** the file is modified externally,
   **Then** the preview refreshes to reflect the latest content within 3 seconds without
   manual action.

---

### User Story 2 - Add an Inline Comment on Selected Text (Priority: P2)

A writer reads their `.md` file in the preview, drags the mouse to highlight a sentence they
want to flag, and a cursor immediately begins blinking in the right gutter at that position —
no form, no buttons. They start typing their note directly; pressing Enter inserts a new paragraph.
When they click anywhere else, the comment saves automatically and appears anchored visually
to the highlighted passage. They can click any comment in the gutter to edit it in-place at
any time. When they close and reopen the editor the next day, the comment is still there.

**Why this priority**: This is the core value proposition — capturing targeted feedback
without modifying the document. It must work reliably and persist across sessions.

**Independent Test**: Open a `.md` file in the preview, drag to highlight any text, type a comment
directly into the blinking cursor, then click elsewhere to auto-save. Close the editor completely,
reopen it, open the same file — the comment is still present, attached to the same text.
Delivers the full annotation value without requiring Claude.

**Acceptance Scenarios**:

1. **Given** a `.md` file is open in the preview, **When** the user drags the mouse to highlight
   a span of text and releases the mouse button, or double-clicks a word, **Then** a blinking
   white cursor appears in the right gutter at the same vertical position as the highlighted
   text — no form, no buttons. If an existing comment already occupies that vertical position,
   the cursor appears directly below it without overlapping. Keyboard-based selection does NOT
   trigger the cursor. The highlighted text is shown with a neutral (non-yellow) visual
   indicator while the cursor is active. The comment area in the gutter shows the same thin
   grey left-edge line from the moment the cursor appears.

2. **Given** the cursor is active in the gutter, **When** the user types text, **Then** the
   text appears inline at the cursor; pressing Enter inserts a paragraph break. When the user
   clicks anywhere outside the input area, the comment is saved automatically and appears in
   the gutter anchored to the selection; the highlighted text switches to yellow. If the user
   never types anything and clicks away (or presses Escape), the cursor is dismissed and no
   comment is created.

3. **Given** at least one comment exists, **When** the user closes and reopens the editor,
   **Then** all previously added comments are present and correctly anchored to their original
   text selections.

4. **Given** a comment exists in the gutter, **When** the user clicks anywhere on the comment
   text, **Then** the comment becomes inline-editable — a cursor appears at the click position
   and the user can freely edit, delete, or add text. Clicking outside saves the updated text.
   Deleting all text and clicking outside removes the comment permanently with no undo.

5. **Given** multiple comments exist on the same file, **When** the user views the file,
   **Then** all comments are visible simultaneously in the right gutter, ordered first by
   their vertical position in the document, then by left-to-right anchor start position
   when anchors share the same line (leftmost anchor's card appears topmost). Comment cards
   never overlap — when two or more cards would occupy the same vertical space they are
   stacked with a gap between them.

6. **Given** a `.md` file with comments is open, **When** the user scrolls through the
   preview, **Then** each comment card remains visually aligned with its highlighted anchor
   text throughout the scroll — the preview content and comment gutter scroll as one.

---

### User Story 3 - Copy and Save Comments for AI Review (Priority: P3)

A writer has annotated one or more `.md` files with comments. They click **"Copy & Save
Comments"** at the bottom of the Comment sidebar. The extension scans every `.md` file in
the workspace that has comments, assembles a structured prompt that begins with a fixed AI
instruction (asking the AI to review all comments and apply the necessary changes), followed
by each file's name and all its anchor + comment pairs (no full document content). The prompt
is copied to the clipboard and written to `CommentRevisions/Revision-R1.md` at the workspace
root. Subsequent clicks create `Revision-R2.md`, `Revision-R3.md`, and so on. The writer
pastes the clipboard into any AI tool of their choice and gets an actionable response without
any additional setup.

**Why this priority**: This is the payoff of the entire annotation workflow — comments
become an actionable AI prompt. It is intentionally AI-agnostic so it works with any
chat tool (Claude, ChatGPT, Gemini, etc.) without requiring any specific integration.
It depends on P1 and P2 being stable, making it the right third priority.

**Independent Test**: Add comments to two different `.md` files. Click "Copy & Save
Comments". Paste into any AI chat — the prompt contains both files' names and each
highlighted text + comment body (no full document content). Open the **Revision History** section
in the Comment sidebar and click `Revision-R1.md` — it contains exactly what was copied.
Click "Copy & Save" again — `Revision-R2.md` appears in the Revisions section,
`Revision-R1.md` is untouched. The `CommentRevisions/` folder is NOT visible in the
Explorer panel.

**Acceptance Scenarios**:

1. **Given** at least one `.md` file in the workspace has one or more comments, **When** the
   user clicks "Copy & Save Comments" in the sidebar, **Then** a structured prompt is
   assembled from all commented files and copied to the system clipboard. The prompt begins
   with a fixed AI instruction preamble asking the AI to review all comments and return the
   revised document with changes applied. After the preamble, for each file, the prompt
   contains: the file name as a heading, and each comment listed as its anchor text (the
   highlighted excerpt) followed by its comment body. Full document content is NOT included.

2. **Given** the prompt is assembled, **When** the copy action completes, **Then** the
   prompt is also written to `CommentRevisions/Revision-R{N}.md` at the workspace root,
   where N starts at 1 and increments for each subsequent click. Existing revision files
   are never overwritten.

3. **Given** no `.md` file in the workspace has any comments, **When** the user clicks
   "Copy & Save Comments", **Then** an informational message is shown ("No comments found")
   and no file is written and nothing is copied to the clipboard.

---

### User Story 4 - Delete All Comments (Priority: P4)

A writer has finished a review cycle and wants to start fresh. They click **"Delete All
Comments"** at the bottom of the Comment sidebar. A confirmation dialog appears warning
them to copy and save first. If they confirm, every sidecar file across all `.md` files
in the workspace is cleared, all yellow highlights and gutter cards disappear, and the
preview refreshes immediately.

**Why this priority**: This is a destructive convenience action. It depends on P2
(comments existing to delete) and is not required for the core annotation loop — hence P4.

**Independent Test**: Add comments to multiple `.md` files. Click "Delete All Comments",
then dismiss the warning — nothing changes. Click again and confirm — all comments vanish
across all files. Reopen the editor — still no comments anywhere.

**Acceptance Scenarios**:

1. **Given** the user clicks "Delete All Comments", **When** the button is clicked,
   **Then** a confirmation dialog appears before any action is taken. The dialog text MUST
   read: *"Do you really want to delete all your comments in all your files? Make sure to
   Copy and Save your Comments first."* The dialog MUST offer a confirm and a cancel action.

2. **Given** the confirmation dialog is shown, **When** the user cancels, **Then** no
   comments are modified and the sidebar and preview are unchanged.

3. **Given** the confirmation dialog is shown, **When** the user confirms, **Then** all
   sidecar files in the workspace are cleared, all highlights and gutter cards disappear
   from the preview immediately, and the sidebar reflects the updated (empty) state.

---

### User Story 5 - Delete a Single Revision File (Priority: P5)

A writer looks at the Revision History panel and sees an old revision they no longer need. They
hover over the revision row and a trash icon appears to the right of the filename. They click the
icon; a confirmation dialog appears asking them to confirm the deletion. If they confirm, the
revision file is permanently removed and the Revision History panel updates immediately. If they
cancel, nothing changes.

**Why this priority**: Revision files accumulate over time. Providing a way to prune individual
entries keeps the history panel clean without requiring filesystem access. It depends on US3
(revisions must exist to delete).

**Independent Test**: Generate at least two revisions via "Copy & Save Comments". Hover over one
revision — a trash icon appears. Click it, then cancel — the file is still listed. Click the trash
icon again and confirm — the file is removed from the panel and from disk. The remaining revision
is unaffected.

**Acceptance Scenarios**:

1. **Given** the Revision History panel contains at least one revision, **When** the user hovers
   over a revision row, **Then** a trash icon appears to the right of the filename within the same
   row. The icon MUST NOT be visible when the row is not hovered.

2. **Given** the user clicks the trash icon on a revision row, **When** the icon is clicked,
   **Then** a confirmation dialog appears. The dialog MUST offer a confirm action ("Delete") and a
   dismiss action ("Cancel").

3. **Given** the confirmation dialog is shown, **When** the user cancels or dismisses, **Then**
   the revision file is not deleted and the Revision History panel is unchanged.

4. **Given** the confirmation dialog is shown, **When** the user confirms, **Then** the revision
   file is permanently deleted from disk and the Revision History panel removes the entry
   automatically.

---

### Edge Cases

- What happens when the selected text appears multiple times in the document? The comment
  anchors to the specific occurrence based on its position in the file (character offset);
  if the document is later edited and the position shifts, the extension re-matches to the
  nearest occurrence.
- What happens when the selected text spans inline markdown formatting (e.g. the user
  highlights text that includes bold, italic, or code spans)? The rendered selection text
  does not match the raw markdown source literally (which contains `**`, `_`, `` ` `` etc.).
  The extension normalizes both the selected text and the source by removing inline markers
  before searching, then stores the raw source span as the anchor so re-matching works correctly.
- What happens when the selected text spans a soft line-break (a bare newline in the source
  that renders as a space in the preview)? The extension collapses all whitespace runs
  (including `\n`) to a single space when searching, so selections across soft line-breaks
  are resolved correctly without requiring users to be aware of raw source formatting.
- What happens when a `.md` file has no text (empty file)? The comment input is disabled;
  a hint is shown explaining that text must exist to add a comment.
- What happens when the sidecar JSON file is corrupted or hand-edited to be invalid? The
  extension treats the file as empty (no comments loaded) and logs a warning; it does not
  crash or overwrite the corrupt file without user action.
- What happens when the user deletes a `.md` file from disk? The orphaned sidecar file
  remains on disk; the extension does not auto-delete it (safe default).
- What happens when a `.md` file is renamed? Existing sidecar comments are lost — the
  sidecar is named after the original file. This is acceptable for MVP.
- What happens when "Copy & Save Comments" is clicked with no comments anywhere in the
  workspace? The extension shows an informational message and does not write any file or
  modify the clipboard.
- What happens if the `CommentRevisions/` folder cannot be created (e.g., permission error)?
  The extension surfaces an error message and does not copy to clipboard; no partial state
  is left behind.
- What happens if a revision file with the target name already exists? This should not
  occur if revision numbers increment correctly, but if it does, the extension appends a
  timestamp suffix (`Revision-R{N}_{YYYYMMDDHHmmss}.md`) rather than overwriting.
- What happens when "Delete All Comments" is confirmed but a sidecar cannot be written
  (e.g., permission error)? The extension surfaces an error message; partial deletion is
  acceptable for MVP (successfully cleared files stay cleared).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST provide an activity bar icon that opens a dedicated sidebar
  panel.
- **FR-002**: The sidebar panel MUST contain two sections: (a) **Markdown Files** — a
  folder-and-file tree showing only `.md` files and their ancestor directories; all other
  file types, hidden files, `node_modules`, and the `CommentRevisions/` folder MUST be
  excluded; (b) **Revision History** — a flat list of all revision files in
  `CommentRevisions/`, sorted newest-first; each entry MUST open the revision file when
  clicked. The Revision History section MUST update automatically when new revision files
  are written.
- **FR-003**: Clicking a `.md` file in the sidebar MUST open it in a rich-text preview panel
  that renders standard markdown (headings, bold, italic, lists, tables, blockquotes, code
  blocks, inline code).
- **FR-004**: The rich-text preview MUST refresh automatically when the `.md` file is changed
  on disk, within 3 seconds.
- **FR-005**: Users MUST be able to initiate a comment by either (a) dragging the mouse to
  highlight a span of text and releasing, or (b) double-clicking a word; a blinking white
  cursor MUST appear in the gutter when the selection is made. Keyboard-based selection MUST
  NOT trigger the cursor. Selections that begin or end outside the preview content area MUST
  be silently ignored. Selections that *cross* the boundary of an existing comment highlight
  (i.e. start or end inside an existing anchor mark without fully containing it) MUST be
  silently ignored; selections that are fully inside or fully contain an existing anchor mark
  MUST be accepted normally. The cursor
  MUST appear top-aligned with the top edge of the first line of the highlighted text. The
  comment input area MUST display the same thin grey left-edge line from the moment it appears.
  While the cursor is active, the selected text MUST remain visually highlighted with a neutral
  (non-yellow) indicator. A muted placeholder (e.g., "Add comment…") MUST be visible in the
  cursor area before the user types.
- **FR-006**: The inline comment input MUST accept plain text; pressing Enter MUST insert a
  paragraph break (multi-line support). No submit button is shown. The comment MUST save
  automatically when the user clicks outside the input (blur) while text is present. Pressing
  Escape or blurring while the input is empty MUST dismiss the cursor with no comment created.
  Pressing Escape while the input is non-empty MUST be a no-op (user must delete text to cancel).
- **FR-007**: Saved comments MUST appear in a right-side gutter panel anchored visually
  to the highlighted text; the highlighted text MUST be visually marked with a yellow background
  in the preview. Comment cards MUST remain vertically aligned with their anchor text as the
  user scrolls — the preview and gutter scroll as a single unit. Comment cards MUST never
  overlap; when two or more cards would occupy the same vertical space they MUST be stacked
  with a visible gap. When two or more comment anchors fall on the same text line, their gutter
  cards MUST be stacked vertically in left-to-right anchor order (the anchor starting furthest
  left appears topmost in the gutter). Each comment card MUST display only the comment body
  text; the anchor text preview and creation timestamp MUST NOT be shown on the card. The
  anchor text highlight in the preview MUST use a yellow background only, with no bottom
  border or underline. Each comment card MUST have a thin light-grey (1–2 px) vertical line
  on its left edge spanning the full height of the card, visually grouping the comment text.
  The gap between adjacent cards' vertical lines indicates separation between comments.
  When the preview width changes (e.g., window resize causes text to reflow), gutter cards
  MUST reposition to stay vertically aligned with their anchor text at the new layout.
- **FR-007a**: When the user clicks on yellow-highlighted anchor text in the preview, the
  corresponding comment card's left-edge vertical line MUST turn white while keeping the same
  width (2 px), indicating the selected comment. Clicking anywhere outside highlighted text
  MUST return the line to its default grey state.
- **FR-008**: Users MUST be able to click anywhere on a comment card to edit it inline (cursor
  appears at click position). Clicking outside the card saves any changes. Deleting all text
  from a comment and clicking outside MUST permanently remove the comment with no undo.
- **FR-009**: All comments for a given `.md` file MUST be persisted to a sidecar file named
  `.{original-filename}.comments.json` located in the same directory as the `.md` file.
- **FR-010**: The sidebar MUST display a "Copy & Save Comments" button at the bottom of the
  file-tree panel, always visible regardless of whether any comments exist.
- **FR-011**: When "Copy & Save Comments" is clicked and at least one file has comments, the
  extension MUST assemble a structured prompt from all commented files in the workspace. The
  prompt MUST begin with a fixed AI instruction preamble that instructs the AI to review all
  comments and return the revised document with changes applied. After the preamble, for each
  file the prompt MUST contain: (a) the file name as a heading, and (b) each comment listed
  as its anchor text (the highlighted excerpt) followed by its comment body. Full document
  content MUST NOT be included. The assembled prompt MUST be copied to the system clipboard.
- **FR-012**: When "Copy & Save Comments" is clicked and at least one file has comments, the
  extension MUST write the assembled prompt to `CommentRevisions/Revision-R{N}.md` at the
  workspace root, where N starts at 1 and increments by 1 on each subsequent click. The
  `CommentRevisions/` folder MUST be created if it does not exist. Existing revision files
  MUST never be overwritten.
- **FR-017**: The `CommentRevisions/` folder MUST be hidden from the Explorer panel (via
  workspace `files.exclude`) so revision files are only accessible through the **Revisions**
  section of the Comment sidebar. This setting MUST be applied automatically on extension
  activation without requiring user configuration.
- **FR-013**: The sidebar MUST display a "Delete All Comments" button at the bottom of the
  file-tree panel, always visible.
- **FR-014**: When "Delete All Comments" is clicked, the extension MUST show a confirmation
  dialog before taking any destructive action. The dialog text MUST be: *"Do you really want
  to delete all your comments in all your files? Make sure to Copy and Save your Comments
  first."*
- **FR-015**: If the user confirms the deletion dialog, the extension MUST clear all sidecar
  files for every `.md` file in the workspace and refresh the active preview immediately to
  show no highlights or gutter cards. If the user dismisses the dialog, no changes are made.
- **FR-016**: If "Copy & Save Comments" is clicked and no files in the workspace have any
  comments, the extension MUST display an informational message ("No comments found") and
  MUST NOT write any file or modify the clipboard.
- **FR-018**: Each revision entry in the Revision History panel MUST display a trash icon that
  appears only when the user hovers over that row. Clicking the icon MUST show a confirmation
  dialog before any deletion occurs. On confirm, the revision file MUST be permanently deleted
  from disk and the panel MUST update automatically. On cancel or dismiss, no action is taken.

### Key Entities

- **Comment**: A user annotation associated with a specific text selection in a `.md` file.
  Attributes: unique identifier, anchor text (verbatim excerpt, used for positioning),
  comment body (plain text, displayed on the card), creation timestamp (stored for future
  use, not displayed).

- **Sidecar File**: A companion file stored alongside a `.md` file that persists all active
  comments for that file. Named `.{filename}.comments.json`. Cleared after each accepted
  review round.

- **Anchor**: The verbatim text excerpt from a `.md` file that a comment is attached to.
  Used to locate the comment's visual position in the preview.

- **Revision Folder**: A folder named `CommentRevisions/` created at the workspace root.
  Contains one revision file per "Copy & Save Comments" action. Hidden from the Explorer
  panel; accessible only via the **Revision History** sidebar section.

- **Revision File**: A versioned `.md` file created each time "Copy & Save Comments" is
  clicked, named `Revision-R{N}.md`. Contains the assembled AI prompt (all commented files'
  content + comments). Permanently retained; never modified after creation.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can install the extension, open a workspace, and view their first `.md`
  file in the preview without any configuration steps.
- **SC-002**: A user can drag to highlight text, type a comment, and save it (by clicking away)
  in under 30 seconds and with no more than 2 distinct interactions.
- **SC-003**: 100% of comments written in one session are present and correctly anchored after
  closing and reopening the editor (full persistence across sessions).
- **SC-004**: After clicking "Copy & Save Comments", the clipboard contains a prompt that
  any AI tool can act on — the writer can paste and get a response without any additional
  setup or configuration.
- **SC-005**: Every click of "Copy & Save Comments" produces exactly one revision file in
  `CommentRevisions/` that contains the full prompt — 100% retention of review snapshots,
  zero data loss, existing files never overwritten.
- **SC-006**: A first-time user can complete the full workflow (open file → add comment →
  run review → approve change) without consulting documentation.

---

## Assumptions

- The workspace is a local folder (no remote or virtual file system support in MVP).
- Comment text is plain text only; no markdown formatting, images, or attachments in comments.
- When the same anchor text appears multiple times in a file, the extension uses character
  offset to identify the correct occurrence; if the offset shifts significantly after edits,
  re-matching to the nearest occurrence is acceptable.
- The sidecar files (`.filename.comments.json`) are expected to be committed to version
  control alongside the `.md` files, enabling team sharing of comments.
- The `CommentRevisions/` folder and its contents are expected to be committed to version
  control as a permanent, human-readable record of each review snapshot. The folder is
  hidden from the Explorer via `files.exclude` but remains fully tracked by Git.
- The "Copy & Save Comments" feature is AI-agnostic — the assembled prompt can be pasted
  into any AI tool (Claude, ChatGPT, Gemini, etc.) and does not require any specific
  integration to be installed.
- After "Delete All Comments" is confirmed, sidecar files are cleared (not deleted) so they
  continue to exist as empty comment stores for the next annotation cycle.
- A writer using this tool is a single user; no concurrent editing or multi-user conflict
  scenarios are in scope.
