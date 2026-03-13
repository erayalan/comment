// src/core/types.ts
// Canonical TypeScript type definitions — imported by all core and host modules.
// Zero vscode imports: this file is platform-agnostic.

export interface CommentAnchor {
  text: string;
  sourceOffset: number;
  contextBefore: string;
  contextAfter: string;
}

export interface Comment {
  id: string;        // uuid v4
  anchor: CommentAnchor;
  body: string;
  createdAt: string; // ISO 8601
}

export interface Sidecar {
  version: 1;
  comments: Comment[];
}

export interface RevisionFileResult {
  path: string;          // absolute path of the written revision file
  revisionNumber: number;
}
