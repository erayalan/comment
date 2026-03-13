# Comment — Inline Comments for Markdown

Leave Google Docs-style inline comments on `.md` files, directly in VS Code.

Highlight any text, type your note, and it sticks to that passage — without touching the document itself. When you're done annotating, copy all your comments as a structured AI prompt and paste into ChatGPT, Claude, Gemini, or any other tool to get a revised draft back.

---

## Install

**VS Code**
```bash
curl -L https://github.com/erayalan/comment/raw/main/comment-0.1.0.vsix -o /tmp/comment.vsix && code --install-extension /tmp/comment.vsix
```

**Cursor**
```bash
curl -L https://github.com/erayalan/comment/raw/main/comment-0.1.0.vsix -o /tmp/comment.vsix && cursor --install-extension /tmp/comment.vsix
```

**Windsurf**
```bash
curl -L https://github.com/erayalan/comment/raw/main/comment-0.1.0.vsix -o /tmp/comment.vsix && windsurf --install-extension /tmp/comment.vsix
```

**Kiro**
```bash
curl -L https://github.com/erayalan/comment/raw/main/comment-0.1.0.vsix -o /tmp/comment.vsix && kiro --install-extension /tmp/comment.vsix
```

---

## Features

### Highlight text → type a comment
Select any text in the preview. A cursor appears in the right gutter — start typing immediately. Click away to save.

### Comments stay anchored
Comments live in a right-side gutter, aligned to the highlighted passage. They scroll with the document and never overlap each other.

### Nothing touches your `.md` files
Comments are stored in a hidden sidecar file (`.filename.comments.json`) next to each markdown file. Your document is never modified.

### Copy & Save for AI review
Click **Copy & Save Comments** to assemble all your annotations into a structured prompt. It's copied to your clipboard and saved as a versioned revision file (`CommentRevisions/Revision-R1.md`, `R2`, …). Paste into any AI — no setup required.

### Revision history
Every "Copy & Save" creates a permanent snapshot in the **Revision History** sidebar panel. Delete individual revisions when you no longer need them.

### Delete all comments
Start a fresh annotation cycle with one click. A confirmation dialog protects you from accidental deletion.

---

## How to Use

1. Open a workspace containing `.md` files
2. Click the **Comment** icon in the Activity Bar
3. Click any `.md` file in the **Markdown Files** tree to open the preview
4. **Drag** to highlight text — a cursor appears in the right gutter
5. Type your comment and click anywhere else to save
6. Repeat across as many files as you like
7. Click **Copy & Save Comments** (toolbar icon in the sidebar)
8. Paste the clipboard into your AI tool of choice

---

## Comment Storage

Comments are stored as sidecar JSON files:

```
your-project/
├── notes.md
├── .notes.md.comments.json   ← comments for notes.md (auto-created)
└── CommentRevisions/
    ├── Revision-R1.md
    └── Revision-R2.md
```

Sidecar files can be committed to version control to share annotations with teammates. The `CommentRevisions/` folder is hidden from the VS Code Explorer but tracked by Git.

---

## Team Collaboration

For real-time collaborative annotation, use [VS Code Live Share](https://marketplace.visualstudio.com/items?itemName=MS-vsliveshare.vsliveshare):

1. The **host** opens the workspace and starts a Live Share session
2. **Guests** join via the shared link — no extra setup needed
3. Any participant can open the Comment preview panel and leave comments
4. Comments are written to the host's sidecar files and are immediately visible to all participants in the session

This requires one team member to be the active host. For async workflows (no live session), commit the `.comments.json` sidecar files to Git so teammates can pull and see each other's annotations.

---

## Installation

Works with VS Code, Cursor, Kiro, Windsurf, and any other VS Code-based IDE.

**Option 1 — UI:**
1. Download `comment-0.1.0.vsix`
2. Open your IDE
3. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
4. Type **"Extensions: Install from VSIX..."** and select it
5. Navigate to the downloaded `.vsix` file and open it

**Option 2 — Terminal:**
```
code --install-extension comment-0.1.0.vsix
```

---

## Requirements

- VS Code 1.74.0 or higher
- A local workspace folder (remote workspaces not supported in this version)

---

## Extension Settings

This extension does not add any settings. The `CommentRevisions/` folder is automatically hidden from the Explorer on activation.

---

## Known Limitations

- Comments are plain text only (no markdown formatting inside comments)
- If a `.md` file is renamed, existing comments are not migrated automatically
- Real-time collaboration requires VS Code Live Share (see [Team Collaboration](#team-collaboration))

---

## License

[MIT](LICENSE)
