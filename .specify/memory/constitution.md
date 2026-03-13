<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0 (MINOR — stale comment rule replaced by feedback archive
  mechanism in Principle II; MVP scope updated to include review round archiving;
  Principle V updated to permit structured review archives while keeping individual
  comment undo/history excluded)
Modified principles:
  - II. Sidecar Persistence: removed stale-comment surfacing rule; added sidecar-clear
    behavior after accepted review
  - IV. Claude as the Editor: added feedback file creation step to review workflow
  - V. Simplicity First: replaced blanket "no history, no archive" rule with targeted
    exclusion of individual comment history; review round archives are now permitted
Added sections: none
Removed sections: none
Templates requiring updates:
  ✅ .specify/memory/constitution.md (this file)
  ⚠ .specify/templates/plan-template.md (verify Constitution Check references updated
    Principle II and V rules)
  ⚠ .specify/templates/tasks-template.md (verify feedback file creation/clearing are
    reflected as required task categories)
Deferred TODOs: none
-->

# Comment Constitution

## Core Principles

### I. Markdown-First

The extension operates exclusively on `.md` files. The sidebar file tree MUST display
only `.md` files and their parent folders. No other file type is surfaced, edited, or
annotated by the extension — now or in future versions without an explicit constitution
amendment.

**Rationale**: Scope discipline prevents feature creep. Markdown is the natural format
for documentation that benefits from collaborative annotation.

### II. Sidecar Persistence

Comments MUST be stored in sidecar JSON files named `.{filename}.comments.json`,
placed in the same directory as their target `.md` file. These files MUST be
git-committed and therefore team-shareable.

Non-negotiable rules:
- Sidecar files are the single source of truth for all active comments.
- Each comment record MUST include: `id`, `anchor` (the highlighted text verbatim),
  `text` (comment body), and `createdAt` (ISO 8601 timestamp).
- After the user accepts Claude's proposed changes to a `.md` file, the sidecar MUST
  be cleared (emptied, not deleted). Comments are not cleared on rejected reviews.
- Sidecar files are NOT the archive of record for past review rounds — that role belongs
  to the feedback files in the `Feedback/` folder.

**Rationale**: Sidecar files keep comments out of the rendered markdown while remaining
git-trackable. Clearing on accepted review keeps the active comment set clean and
meaningful for the next annotation cycle.

### III. VS Code Native, IDE-Portable

The extension targets the VS Code Extension API and MUST function on all VS Code-based
editors (VS Code, Cursor, Windsurf, and similar forks) without modification.

Non-negotiable rules:
- Core comment logic (CRUD, anchor resolution, Claude prompt assembly) MUST reside
  in a platform-agnostic module with no direct VS Code API imports.
- VS Code-specific code (sidebar webview, commands, decorations) is a thin host layer
  that calls into the core module.
- No JetBrains or LSP support is required for MVP, but the architecture MUST NOT
  structurally prevent a future port.

**Rationale**: VS Code forks share the same extension API. Separating core logic
protects the investment if portability expands later.

### IV. Claude as the Editor

Claude is the sole mechanism for applying comment-driven changes to `.md` files.
The extension MUST NOT directly modify file content in response to comments.

Non-negotiable rules:
- The `/comment.review` (or equivalent) slash command MUST, in order: (1) create the
  feedback file archive, (2) pass the full `.md` content and sidecar comments to Claude,
  (3) present Claude's output as a diff for user review.
- The extension surfaces comments TO Claude; Claude produces the edit; the user
  reviews and approves via standard VS Code diff review.
- The extension MUST NOT auto-apply Claude's output without user review.
- If no comments exist, the slash command MUST abort with an informational message;
  it MUST NOT invoke Claude or create a feedback file.

**Rationale**: Keeps the human in the loop for all content changes. Claude's edit
flow already provides diff review — this extension must not bypass it.

### V. Simplicity First (MVP Discipline)

Every feature starts at its simplest viable form. Complexity MUST be justified by a
real, current user need — not a hypothetical future one.

Non-negotiable rules:
- Comments are flat. No threads, no replies, no reactions.
- The extension is single-user. No real-time collaboration, no conflict resolution.
- Individual comment deletion is permanent — no per-comment undo, history, or restore.
- Review round archives (the `Feedback/` folder) ARE permitted and are the only
  sanctioned form of historical record. They are document-level snapshots, not
  comment-level history.
- YAGNI applies: do not design comment data structures or APIs for features not in
  the current spec.

**Rationale**: The MVP validates the core loop (annotate → Claude refines) before
adding collaboration or persistence complexity.

### VI. Test-Alongside

Every non-trivial unit of logic MUST have a test written during (not after)
implementation. No pull request merges without test coverage on core paths.

Non-negotiable rules:
- Core paths requiring tests: comment CRUD operations, anchor resolution (text
  matching), sidecar file read/write/clear, feedback file creation and revision
  numbering, Claude prompt assembly.
- Webview UI and manual interactions are exempt from automated testing in MVP and
  MUST be tested manually before merging.
- Tests MUST run in CI without a VS Code instance (use VS Code's test runner with
  `@vscode/test-electron` or equivalent headless approach for unit tests).

**Rationale**: Test-alongside prevents a test debt backlog while avoiding the
overhead of strict TDD for a UI-heavy extension project.

## MVP Scope & Exclusions

**In scope for MVP**:
- Sidebar panel listing folders and `.md` files only
- Rich-text-style preview of `.md` files within the extension panel
- Text selection and inline comment creation (highlight → comment form → submit)
- Comment display on the right side of the preview; click to delete
- Sidecar JSON persistence (`.filename.comments.json`); cleared after accepted review
- `/comment.review` slash command that passes the file + comments to Claude
- Review round archiving: `Feedback/` folder + versioned `{name}_feedback_R{N}.md`
  files capturing the pre-edit document and all comments at each review point

**Explicitly out of scope for MVP** (requires constitution amendment to add):
- Comment threads or nested replies
- Multi-user collaboration or real-time sync
- Non-`.md` file annotation
- Individual comment history, undo, or restore after deletion
- Comment resolution status (resolved/unresolved tracking)
- User attribution beyond the local machine user

## Development Workflow

All features for this project MUST follow the SpecKit pipeline:

1. `/speckit.specify` — write a technology-agnostic spec
2. `/speckit.clarify` — resolve ambiguities (max 3 rounds)
3. `/speckit.plan` — technical design with stack and phased breakdown
4. `/speckit.tasks` — dependency-ordered task list
5. `/speckit.analyze` — consistency check before implementation
6. `/speckit.implement` — execute tasks phase-by-phase

Publishing target: **VS Code Marketplace** (marketplace.visualstudio.com).
Every feature shipped MUST pass manual smoke-test on VS Code stable before
a marketplace release is tagged.

## Governance

This constitution supersedes all other conventions and practices in this repository.
Any deviation from a principle MUST be documented in the relevant spec or plan with
an explicit justification.

Amendment procedure:
1. Propose the amendment in a spec or as a standalone markdown document.
2. Identify which principles are affected and which downstream artifacts need updating.
3. Increment the version using semantic versioning:
   - **MAJOR**: Principle removal, redefinition, or incompatible governance change.
   - **MINOR**: New principle or section added.
   - **PATCH**: Clarifications, wording, or non-semantic refinements.
4. Update `LAST_AMENDED_DATE` and regenerate the Sync Impact Report header.

All specs, plans, and tasks generated by the SpecKit pipeline MUST include a
Constitution Check section confirming compliance with the principles above.

**Version**: 1.1.0 | **Ratified**: 2026-02-26 | **Last Amended**: 2026-02-26
