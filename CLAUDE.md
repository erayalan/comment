# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repository Is

**SpecKit** is a specification-driven feature development framework. It provides templates, scripts, and Claude commands that guide a feature from natural language description → spec → plan → tasks → implementation. It has no build/lint/test commands of its own — it orchestrates those for target projects.

## Core Workflow

The seven `/speckit.*` commands form a pipeline:

1. `/speckit.specify <description>` — Convert feature description to `spec.md`; creates a numbered branch and populates `specs/###-feature-name/`
2. `/speckit.clarify` — Resolve ambiguous requirements in the spec (max 3 clarifications)
3. `/speckit.plan` — Generate `plan.md` with tech stack, architecture, and phased implementation
4. `/speckit.tasks` — Generate dependency-ordered `tasks.md` organized by user story
5. `/speckit.analyze` — Cross-artifact consistency check across spec/plan/tasks
6. `/speckit.implement` — Execute tasks from `tasks.md` phase-by-phase
7. `/speckit.taskstoissues` — Export tasks as GitHub Issues or equivalent

## Feature Directory Layout

Each feature lives on a branch named `###-short-name` (e.g., `001-user-auth`), with artifacts at:

```
specs/###-feature-name/
├── spec.md          # What to build (business/user perspective, no tech details)
├── plan.md          # How to build it (tech stack, data model, phases)
├── tasks.md         # Ordered task list with [P] parallel flags and [USN] story labels
├── checklists/
│   ├── requirements.md
│   ├── ux.md
│   └── security.md
└── contracts/       # API/interface contracts (optional)
```

## Key Files

- [.claude/commands/](`.claude/commands/`) — Claude command definitions (prompt templates for the pipeline)
- [.specify/templates/](`.specify/templates/`) — Markdown templates for spec, plan, tasks, checklist, constitution
- [.specify/scripts/bash/](`.specify/scripts/bash/`) — Bash utilities; `common.sh` exports `get_feature_paths()`, `get_repo_root()`, etc.
- [.specify/memory/constitution.md](`.specify/memory/constitution.md`) — Project constitution (fill in with project-specific principles); all specs/plans/tasks must comply

## Feature Branch Numbering

Branch numbers are globally sequential across all features. The `create-new-feature.sh` script finds the highest number from remote branches, local branches, and `specs/` directories, then uses `highest + 1`. Numbers are zero-padded to 3 digits (`001`, `002`, …).

## Task Format in tasks.md

```markdown
- [ ] T001 Create project structure per implementation plan
- [ ] T005 [P] Implement authentication middleware        ← [P] = can run in parallel
- [ ] T012 [P] [US1] Create User model                  ← [US1] = belongs to user story 1
```

## Spec Quality Rules

Specs must be:
- **Technology-agnostic**: no languages, frameworks, databases, or APIs
- **User/business-focused**: written for non-technical stakeholders
- **Testable**: every requirement has measurable acceptance criteria
- **Max 3 [NEEDS CLARIFICATION] markers**: prioritized by scope > security > UX

## Constitution

The `.specify/memory/constitution.md` is a placeholder template. Running `/speckit.constitution` interactively fills it with project-specific principles (e.g., Library-First, Test-First, CLI Interface). All downstream artifacts must comply with or explicitly justify deviating from these principles.

## Active Technologies
- TypeScript 5.x (Node.js 18+, VS Code extension host) (001-md-comments)
- Sidecar JSON files (`.{filename}.comments.json`) on local disk, managed (001-md-comments)

## Recent Changes
- 001-md-comments: Added TypeScript 5.x (Node.js 18+, VS Code extension host)
