# Contract: Webview ↔ Extension Host Message Protocol

**Feature**: `001-md-comments` | **Date**: 2026-02-26

All communication between the webview iframe and the VS Code extension host uses
`vscode.postMessage()` (webview → host) and `panel.webview.postMessage()` (host →
webview). All messages are plain JSON objects with a `type` discriminator.

---

## Webview → Host Messages

### `textSelected`

Fired when the user makes a non-empty text selection via drag or double-click. Selections
that begin or end outside `#preview`, or that partially overlap an existing
`mark.comment-anchor`, are silently ignored and do not produce this message.

```typescript
interface TextSelectedMessage {
  type: 'textSelected';
  selectedText: string;      // Verbatim text from window.getSelection().toString().trim()
  occurrenceIndex: number;   // 0-based count of same text before this selection in DOM order
  rectTop: number;           // document-relative Y offset (px) of selection's top edge
                             // (range.getClientRects()[0].top + canvas.scrollTop)
  rectLeft: number;          // viewport X offset (px) of selection's left edge
                             // (range.getClientRects()[0].left); used for same-line ordering
}
```

**Host response**: Host computes `sourceOffset` using `occurrenceIndex`, creates
a pending anchor, then sends `showCommentForm` back to the webview.

---

### `submitComment`

Fired when the user submits the comment input form.

```typescript
interface SubmitCommentMessage {
  type: 'submitComment';
  body: string;              // Plain-text comment body (trimmed, non-empty)
  pendingAnchorId: string;   // Opaque token issued by host in showCommentForm
                             // Used to correlate with the computed anchor
}
```

**Validation**: If `body.trim().length === 0`, the webview shows an inline
validation error and does NOT send this message.

**Host response**: Host creates the Comment, writes the sidecar, then sends
`renderComments` to update the display.

---

### `cancelComment`

Fired when the user dismisses the comment form without submitting (Escape key or
Cancel button).

```typescript
interface CancelCommentMessage {
  type: 'cancelComment';
  pendingAnchorId: string;   // Token to clean up pending anchor in host
}
```

**Host response**: Host discards the pending anchor. No sidecar write.

---

### `deleteComment`

Fired when the user clicks "Delete" on a comment and confirms the deletion dialog
inside the webview.

```typescript
interface DeleteCommentMessage {
  type: 'deleteComment';
  commentId: string;         // UUID of the comment to delete
}
```

**Host response**: Host removes the comment from the sidecar, writes the updated
sidecar, then sends `renderComments`.

---

### `ready`

Fired once when the webview's DOM is loaded and the webview JS is initialized.
Signals to the host that it can safely send the initial `renderComments` and
`setFileContent` messages.

```typescript
interface ReadyMessage {
  type: 'ready';
}
```

---

## Host → Webview Messages

### `setFileContent`

Sent when a new file is opened in the preview, or when the file changes on disk
(auto-refresh trigger). Replaces the entire preview content.

```typescript
interface SetFileContentMessage {
  type: 'setFileContent';
  html: string;              // Rendered markdown HTML with <mark> highlights already
                             // injected for all active comments; CSP-safe (no inline
                             // event handlers; uses nonce for inline styles if any)
  filePath: string;          // Absolute path of the .md file (for display in title bar)
}
```

---

### `showCommentForm`

Sent after the host has processed a `textSelected` message and computed the anchor.
Instructs the webview to display the comment input form at the correct gutter position.

```typescript
interface ShowCommentFormMessage {
  type: 'showCommentForm';
  pendingAnchorId: string;   // Opaque token, echoed in submitComment / cancelComment
  rectTop: number;           // document-relative Y offset where the form should appear
                             // (echoed from textSelected)
  rectLeft: number;          // viewport X offset echoed from textSelected; used by the
                             // webview to sort the new form among same-line cards
  anchorPreview: string;     // First 60 chars of anchor.text, for display in the form
                             // header ("Commenting on: ...")
}
```

---

### `renderComments`

Sent after any comment CRUD operation (add, delete) or on initial load. Provides the
full current comment list for the webview to re-render the gutter.

```typescript
interface RenderCommentsMessage {
  type: 'renderComments';
  comments: GutterComment[];
}

interface GutterComment {
  id: string;
  anchorPreview: string;     // First 60 chars of anchor.text
  body: string;
  createdAt: string;
  rectTop: number;           // Current document-relative Y position of the <mark> element
                             // with data-comment-id matching this id; -1 if anchor not found
                             // (orphaned comment)
  isOrphaned: boolean;       // true if rectTop === -1
}
```

The webview positions each gutter card at `rectTop` from the top of the preview
container. Orphaned comments (anchor text deleted from file) are displayed at the
bottom of the gutter with a visual indicator.

---

### `showError`

Sent to display an error message in the preview area (e.g., sidecar read failure,
`Feedback/` write failure).

```typescript
interface ShowErrorMessage {
  type: 'showError';
  message: string;           // Human-readable error message
}
```

---

## Message Flow Diagrams

### Opening a File

```
Host                                    Webview
 │  panel.webview.postMessage(...)         │
 │ ─── [DOM loads] ──────────────────────► │
 │ ◄── ready ──────────────────────────── │
 │ ─── setFileContent(html, filePath) ───► │  (html includes <mark> highlights)
 │ ─── renderComments(comments) ─────────► │
```

### Adding a Comment

```
Host                                    Webview
 │                                         │  User selects text
 │ ◄── textSelected(text, idx, rectTop) ── │
 │  [compute anchor, generate pendingId]   │
 │ ─── showCommentForm(pendingId, top) ───► │
 │                                         │  User types + submits
 │ ◄── submitComment(body, pendingId) ──── │
 │  [create Comment, writeSidecar]          │
 │  [re-render HTML with new <mark>]        │
 │ ─── setFileContent(html) ─────────────► │
 │ ─── renderComments(comments) ─────────► │
```

### Deleting a Comment

```
Host                                    Webview
 │                                         │  User clicks Delete + confirms
 │ ◄── deleteComment(commentId) ────────── │
 │  [remove from sidecar, writeSidecar]     │
 │  [re-render HTML without that <mark>]    │
 │ ─── setFileContent(html) ─────────────► │
 │ ─── renderComments(comments) ─────────► │
```
