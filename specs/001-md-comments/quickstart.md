# Developer Quickstart: Inline Markdown Comment Extension

**Feature**: `001-md-comments` | **Date**: 2026-02-26

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org or `nvm install 18` |
| npm | 9+ (bundled with Node 18) | — |
| VS Code | 1.74+ | https://code.visualstudio.com |
| Git | Any | — |

No global npm packages are required.

---

## Initial Setup

```bash
# Clone and switch to feature branch
git clone <repo-url> comment
cd comment
git checkout 001-md-comments

# Install dependencies (created during implementation)
npm install
```

---

## Project Initialization (First-Time Only)

When implementing from scratch (tasks.md Phase 1), scaffold the extension:

```bash
# Install the VS Code extension generator (one-time)
npm install -g yo generator-code

# Generate the extension scaffold — choose:
#   Extension type: New Extension (TypeScript)
#   Name: comment
#   Identifier: comment
#   Description: Inline comments for markdown files
#   Bundle: Yes (esbuild)
#   Git init: No (already in repo)
yo code
```

The generator creates `package.json`, `tsconfig.json`, `esbuild.js`, and
`src/extension.ts`. Reorganize `src/extension.ts` into the `src/host/` and
`src/core/` structure defined in `plan.md` after generation.

---

## Development Workflow

### Build

```bash
npm run compile        # One-time build (esbuild: both extension + webview bundles)
npm run watch          # Incremental rebuild on file change
```

### Run Extension in Development

Press **F5** in VS Code (with this workspace open) to launch the Extension
Development Host — a second VS Code window with the extension loaded. Any
`console.log()` output appears in the first window's Debug Console.

Alternatively:
```bash
# Open the extension project in VS Code
code .
# Then press F5
```

### Run Unit Tests (No VS Code Instance)

```bash
npm run test:unit
```

Runs `mocha` directly on the compiled `tests/unit/` output. Covers all
`src/core/` modules. No Electron, no display required. Safe for CI.

### Run Integration Tests

```bash
npm run test:integration
```

Launches a VS Code test instance via `@vscode/test-electron`. Requires a
display (Linux CI: use `xvfb-run npm run test:integration`).

### Run All Tests

```bash
npm test   # runs test:unit then test:integration
```

### Lint

```bash
npm run lint           # eslint + @typescript-eslint
npm run lint --fix     # auto-fix
```

---

## Package for Distribution

```bash
npm run package        # Produces comment-{version}.vsix
```

Install locally:
```bash
code --install-extension comment-{version}.vsix
```

Publish to VS Code Marketplace (requires vsce login):
```bash
npm run publish
```

---

## Key npm Scripts (target state after implementation)

```json
{
  "scripts": {
    "compile":          "node esbuild.js",
    "watch":            "node esbuild.js --watch",
    "test:unit":        "mocha --require ts-node/register 'tests/unit/**/*.test.ts'",
    "test:integration": "node out/test/runTest.js",
    "test":             "npm run test:unit && npm run test:integration",
    "lint":             "eslint src --ext ts",
    "package":          "vsce package",
    "publish":          "vsce publish"
  }
}
```

---

## Directory Reference

| Path | Purpose |
|------|---------|
| `src/core/` | Platform-agnostic logic (no `vscode` imports) |
| `src/host/` | VS Code extension host adapter |
| `src/webview/` | Webview iframe frontend |
| `tests/unit/` | Mocha unit tests for `src/core/` |
| `tests/integration/` | VS Code integration tests |
| `.claude/commands/comment.review.md` | Claude Code slash command |
| `specs/001-md-comments/` | All design artifacts for this feature |

---

## Workspace Setup for Manual Testing

1. Open VS Code with a workspace containing `.md` files (e.g., this repo root).
2. Press **F5** to launch the Extension Development Host.
3. In the new window, click the **Comment** icon in the Activity Bar (left sidebar).
4. The `.md` file tree should appear.
5. Click any `.md` file to open it in the preview.
6. Select text → comment form should appear on the right.
7. Submit a comment → the text should be highlighted; the comment appears in the gutter.
8. Close and reopen the Extension Development Host → comments should persist.
9. Open Claude chat panel → type `/comment.review` → follow the prompts.

---

## Git Workflow Note

Sidecar files (`.*.comments.json`) are intentionally tracked in version control
to enable comment sharing. If your team prefers not to share comments, add to
`.gitignore`:

```gitignore
# Ignore comment sidecar files (optional, not recommended)
.*.comments.json
```

The `Feedback/` directories are also tracked to preserve review history. They may
be excluded with:

```gitignore
**/Feedback/
```

These are user decisions — the extension does not modify `.gitignore` automatically.
