// src/core/comment.ts
// Comment CRUD operations — platform-agnostic (zero vscode imports).

import { v4 as uuidv4 } from 'uuid';
import type { Comment, CommentAnchor, Sidecar } from './types.js';

/**
 * Create a new Comment with a uuid v4 id and ISO 8601 createdAt timestamp.
 * Throws if body is empty.
 */
export function createComment(anchor: CommentAnchor, body: string): Comment {
  if (body.trim().length === 0) {
    throw new Error('Comment body must not be empty.');
  }
  return {
    id: uuidv4(),
    anchor,
    body,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Return a new Sidecar with the comment identified by `id` removed.
 * If the id is not found the sidecar is returned unchanged.
 */
export function deleteComment(sidecar: Sidecar, id: string): Sidecar {
  return {
    ...sidecar,
    comments: sidecar.comments.filter((c) => c.id !== id),
  };
}

/**
 * Find a comment by id. Returns undefined if not found.
 */
export function findComment(sidecar: Sidecar, id: string): Comment | undefined {
  return sidecar.comments.find((c) => c.id === id);
}

/**
 * Return a new Sidecar with the specified comment's body replaced.
 * If the id is not found the sidecar is returned unchanged.
 * Throws if newBody is empty.
 */
export function updateComment(sidecar: Sidecar, id: string, newBody: string): Sidecar {
  if (newBody.trim().length === 0) {
    throw new Error('Comment body must not be empty.');
  }
  return {
    ...sidecar,
    comments: sidecar.comments.map((c) =>
      c.id === id ? { ...c, body: newBody } : c,
    ),
  };
}
