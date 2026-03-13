# Data Model: Inline Markdown Comment Extension

**Feature**: `001-md-comments` | **Phase**: 1 | **Date**: 2026-02-26

---

## Entities

### 1. CommentAnchor

The position descriptor that attaches a `Comment` to a specific span of text in a
`.md` file. Stored inside the `Comment` record.

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Verbatim text the user selected. Max 500 chars. Used as the primary matching key and displayed in the gutter header. |
| `sourceOffset` | `number` | UTF-16 character offset of the anchor's start in the `.md` source file at the time the comment was created. Used for fast exact-offset re-location. |
| `contextBefore` | `string` | Up to 40 chars of source text immediately preceding `text`. Used for fuzzy re-location when `sourceOffset` is stale. |
| `contextAfter` | `string` | Up to 40 chars of source text immediately following `text`. Used for fuzzy re-location when `sourceOffset` is stale. |

**Invariants**:
- `text.length > 0`
- `sourceOffset >= 0`
- `contextBefore` and `contextAfter` may be empty strings (if anchor is at start/end
  of file).

---

### 2. Comment

A user annotation attached to a specific text selection in a `.md` file. Stored as
an element in the `Sidecar.comments` array.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID v4. Stable identifier. Used as `data-comment-id` in the webview and as the key for highlight injection. |
| `anchor` | `CommentAnchor` | The position descriptor (see above). |
| `body` | `string` | Plain-text comment content entered by the user. No markdown formatting. |
| `createdAt` | `string` | ISO 8601 timestamp (e.g., `2026-02-26T14:30:00.000Z`). |

**Invariants**:
- `id` is unique within a `Sidecar`.
- `body.length > 0` (empty comments are not permitted).
- `createdAt` is set at creation time and never modified.

**Operations**:
- `createComment(anchor, body) → Comment` — generates `id` (uuid v4) and `createdAt` (Date.now().toISOString()).
- `deleteComment(sidecar, id) → Sidecar` — returns a new sidecar with the comment removed; permanent, no undo.
- `findComment(sidecar, id) → Comment | undefined`

---

### 3. Sidecar

The on-disk persistence format for all active comments on a single `.md` file.

**File naming**: `.{filename}.comments.json` in the same directory as the `.md` file.
Example: for `README.md`, the sidecar is `.README.md.comments.json`.

| Field | Type | Description |
|-------|------|-------------|
| `version` | `number` | Schema version. Currently `1`. Incremented on breaking schema changes. |
| `comments` | `Comment[]` | Active comments, in creation order. |

**File states**:
- **Absent**: No comments have ever been created, or the file was deleted. Treated
  as an empty sidecar (`{ version: 1, comments: [] }`).
- **Present, valid JSON**: Loaded and parsed normally.
- **Present, invalid JSON**: Treated as empty; a warning is logged; the file is NOT
  overwritten until the user explicitly takes an action (per spec edge case).
- **Present, empty comments array**: Normal state after an accepted review. The file
  remains on disk as an empty store for the next annotation cycle.

**Operations**:
- `readSidecar(path) → Sidecar` — reads file; returns empty sidecar if absent or corrupt.
- `writeSidecar(path, sidecar) → void` — writes JSON atomically (write to `.tmp`, rename).
- `clearSidecar(path) → void` — writes `{ version: 1, comments: [] }` to the file.

**Validation rules**:
- `version` must be a positive integer.
- `comments` must be an array (may be empty).
- Each comment element must have `id` (non-empty string), `anchor.text` (non-empty
  string), `anchor.sourceOffset` (non-negative number), `body` (non-empty string),
  `createdAt` (non-empty string).
- Comments failing validation are silently dropped (the sidecar is still loaded with
  the valid comments; a warning is logged per dropped comment).

---

### 4. FeedbackFile

A versioned `.md` snapshot written to disk before each Claude review round. Never
modified after creation.

**File naming**: `{original-name}_feedback_R{N}.md` inside a `Feedback/` subdirectory
adjacent to the `.md` file.
Example: for `docs/guide.md`, after the first review:
`docs/Feedback/guide_feedback_R1.md`.

**Revision numbering**: `N` starts at 1 and increments by 1 for each subsequent
review of the same file. The extension scans `Feedback/` for existing files matching
the pattern `{name}_feedback_R*.md`, extracts all `N` values, and uses `max(N) + 1`.
If no prior files exist, `N = 1`.

**Collision guard**: If a file with the target name already exists (should not happen
with correct revision numbering), append a timestamp suffix:
`{name}_feedback_R{N}_{timestamp}.md` where `timestamp` is `YYYYMMDDHHmmss`.

**File format**:

```markdown
{full original .md file content, verbatim, unchanged}

---

## Review Comments

| # | Anchor Text | Comment |
|---|-------------|---------|
| 1 | "first few words of anchor..." | Comment body text |
| 2 | "another anchor text..." | Another comment body |
```

**Invariants**:
- The file is created BEFORE Claude is invoked.
- The file is never deleted or modified after creation.
- Anchor text in the table is truncated to 60 chars with `...` suffix if longer.
- If the `Feedback/` directory cannot be created (permission error), the review
  is aborted and no feedback file is written.

**Operations**:
- `getNextRevisionNumber(feedbackDir, baseName) → number`
- `buildFeedbackContent(originalContent, comments) → string`
- `writeFeedbackFile(feedbackDir, baseName, content) → string` (returns absolute path)

---

## State Transitions

### Comment Lifecycle

```
                   ┌──────────────────────────┐
                   │                          │
User selects text  │                          │
+ submits comment  │      ACTIVE              │
─────────────────► │  (in sidecar.comments)   │
                   │                          │
                   └──────┬───────────┬───────┘
                          │           │
             User deletes │           │ User accepts
             comment      │           │ Claude's review
                          ▼           ▼
                      DELETED     ARCHIVED
                    (removed    (sidecar cleared;
                    from         comment preserved
                    sidecar)     in feedback file)
```

### Review Workflow

```
User invokes /comment.review
        │
        ▼
[Guard] Any comments?
  NO → Show info message → STOP
  YES ↓
        │
        ▼
[1] Create Feedback/ directory (if absent)
        │
        ▼
[2] Compute next revision number N
        │
        ▼
[3] Write {name}_feedback_R{N}.md
    (original content + Review Comments table)
        │
        ▼
[4] Assemble Claude prompt
    (full file content + all comments with anchors)
        │
        ▼
[5] Claude produces revised file content
        │
        ▼
[6] VS Code diff presented to user
        │
    ┌───┴───┐
    │       │
  ACCEPT  REJECT
    │       │
    ▼       ▼
[7] File   Feedback file retained
    updated as record of review attempt;
    + sidecar original file and
    cleared   comments UNCHANGED
```

---

## TypeScript Type Definitions (Canonical)

```typescript
// src/core/types.ts

export interface CommentAnchor {
  text: string;
  sourceOffset: number;
  contextBefore: string;
  contextAfter: string;
}

export interface Comment {
  id: string;           // uuid v4
  anchor: CommentAnchor;
  body: string;
  createdAt: string;    // ISO 8601
}

export interface Sidecar {
  version: 1;
  comments: Comment[];
}

export interface FeedbackFileResult {
  path: string;         // absolute path of the written feedback file
  revisionNumber: number;
}
```

---

## File System Layout Example

Given workspace:

```text
workspace/
├── README.md
├── docs/
│   ├── guide.md
│   └── api.md
└── images/
    └── logo.png        ← hidden from sidebar (not .md)
```

After one annotation session on `docs/guide.md` with 2 comments, and one accepted
review:

```text
workspace/
├── README.md
├── .README.md.comments.json        ← empty (no comments yet)
├── docs/
│   ├── guide.md                    ← updated by accepted review
│   ├── .guide.md.comments.json     ← cleared (empty after accepted review)
│   ├── api.md
│   └── Feedback/
│       └── guide_feedback_R1.md    ← permanent record of round 1
└── images/
    └── logo.png
```

The `.README.md.comments.json` file does not exist until the user opens README.md
in the preview and the extension detects it. The `.guide.md.comments.json` exists
and is empty (not deleted) after the accepted review.
