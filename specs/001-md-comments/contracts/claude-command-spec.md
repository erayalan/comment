# Contract: /comment.review Claude Code Command

**Feature**: `001-md-comments` | **Date**: 2026-02-26

Defines the interface and behavior of the `/comment.review` Claude Code slash command,
stored at `.claude/commands/comment.review.md`.

---

## Command Identity

| Property | Value |
|----------|-------|
| Command name | `comment.review` |
| File location | `.claude/commands/comment.review.md` |
| Invocation | `/comment.review` in Claude Code chat panel |
| Arguments | Optional: absolute path to a `.md` file. If omitted, the command reads the active `.md` file from the current workspace context. |

---

## Preconditions (Guard Checks)

Before proceeding, the command MUST verify:

1. **A `.md` file is identified.** Either from `$ARGUMENTS` or from the current
   workspace context. If no `.md` file is identifiable, Claude responds with an
   informational message: _"No markdown file is currently open. Please open a `.md`
   file in the Comment extension preview and try again."_ — then STOPS.

2. **The sidecar file exists and has at least one comment.** Read
   `.{filename}.comments.json` adjacent to the `.md` file. If the file is absent,
   empty, or has `comments: []`, Claude responds: _"No comments found for
   `{filename}`. Add at least one comment in the Comment extension preview before
   running a review."_ — then STOPS.

---

## Execution Steps (Ordered, Non-Skippable)

### Step 1 — Create Feedback Archive

1. Read the full content of the `.md` file.
2. Read all comments from the sidecar (`comments` array).
3. Determine the `Feedback/` directory path (adjacent to the `.md` file).
4. Scan `Feedback/` for existing files matching `{basename}_feedback_R*.md`
   to determine the next revision number `N`.
5. Build the feedback file content:
   - Section 1: The full original `.md` file content, verbatim.
   - Section 2: A `## Review Comments` markdown table with columns
     `#`, `Anchor Text`, `Comment`. Anchor text truncated to 60 chars.
6. Write the feedback file to `Feedback/{basename}_feedback_R{N}.md`.
   If `Feedback/` does not exist, create it first.
   If the target filename already exists (collision), append `_{timestamp}` before
   `.md` (e.g., `guide_feedback_R2_20260226143022.md`).

**This step MUST complete before Step 2. If Step 1 fails (e.g., permission error),
STOP and inform the user. Do NOT proceed to invoke Claude's review.**

### Step 2 — Assemble Review Prompt

Construct the prompt passed to Claude's own reasoning:

```
You are reviewing a markdown document. Below is the full document content,
followed by a list of inline comments left by the author. Each comment has
an anchor (the specific text it refers to) and a note from the author.

Please revise the document to address each comment. Rules:
- Address every comment; do not ignore any.
- Preserve the document structure (headings, lists, tables) unless a comment
  explicitly requests structural changes.
- Do not introduce new sections or topics not mentioned in the comments.
- Return only the revised full document content, with no preamble or explanation.

---

## Document: {filename}

{full .md file content}

---

## Comments

{for each comment:}
**Comment #{N}**
Anchor: "{anchor.text}"
Note: {comment.body}

{end for}
```

### Step 3 — Produce Revised File

Using the prompt from Step 2, produce a revised version of the `.md` file that
addresses all comments.

### Step 4 — Present Diff for User Review

Use the standard Claude Code diff presentation to show the proposed changes to the
user. The user must explicitly accept or reject the changes.

**MUST NOT auto-apply changes.** The user's approval is required.

### Step 5 — Clear Sidecar on Accept

If the user accepts the proposed changes and the `.md` file is updated:
- Write `{ "version": 1, "comments": [] }` to the sidecar file
  `.{filename}.comments.json`.
- Log a message: _"Review complete. {N} comment(s) archived in
  `Feedback/{basename}_feedback_R{N}.md`. Comments cleared."_

If the user rejects the proposed changes:
- Leave the sidecar unchanged.
- Log a message: _"Review cancelled. Comments retained. Feedback snapshot saved at
  `Feedback/{basename}_feedback_R{N}.md`."_

---

## Invariants

- The feedback file is ALWAYS created before Claude's review prompt is assembled.
- The diff is ALWAYS presented for user review; auto-apply is NEVER performed.
- If `$ARGUMENTS` is provided, it takes precedence over any other file detection.
- The command aborts at the first guard failure or Step 1 failure.

---

## Error Responses

| Condition | User-facing message |
|-----------|---------------------|
| No `.md` file identified | "No markdown file is currently open. Please open a `.md` file in the Comment extension preview and try again." |
| No comments in sidecar | "No comments found for `{filename}`. Add at least one comment in the Comment extension preview before running a review." |
| `Feedback/` cannot be created | "Could not create `Feedback/` directory at `{path}`: {error}. Review aborted. Your file and comments are unchanged." |
| Sidecar read error | "Could not read comments from `{sidecar path}`: {error}. Review aborted." |
| Sidecar write error (Step 5) | "Review was accepted but comments could not be cleared from `{sidecar path}`: {error}. Please clear the sidecar manually." |

---

## Example Invocation

User in Claude chat panel:
```
/comment.review
```

Or with explicit path:
```
/comment.review /Users/me/project/docs/guide.md
```

Expected output sequence:
1. `✓ Feedback archived: docs/Feedback/guide_feedback_R1.md`
2. Claude proposes changes as a diff.
3. User accepts → `✓ Comments cleared. Review complete.`
   User rejects → `Review cancelled. Feedback snapshot retained at docs/Feedback/guide_feedback_R1.md.`
