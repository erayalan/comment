// src/core/prompt.ts
// Assembles the structured AI-review prompt from one or more commented files.
// Zero vscode imports: platform-agnostic.

import type { Comment } from './types.js';

export interface FileInput {
  filename: string;
  comments: Comment[];
}

const PREAMBLE =
  'Please review all the comments below and make the ' +
  'necessary changes to the documents mentioned. Each comment is anchored to a specific text excerpt — ' +
  'use the anchor to locate the passage in the documents and apply the suggested edits. ' +
  'After reviewing all comments, return the revised document with all changes applied.' +
  '\n\n---\n\n';

/**
 * Build a structured prompt from all files that have comments.
 * Files with zero comments are silently skipped.
 * Returns an empty string if every file has zero comments.
 *
 * Output format:
 *   {PREAMBLE}
 *
 *   # File: {filename}
 *
 *   **Anchor:** {anchor.text}
 *   **Comment:** {body}
 *
 *   (repeated per comment)
 *
 * Files are separated by "\n\n---\n\n".
 */
export function assembleReviewPrompt(files: FileInput[]): string {
  const sections: string[] = [];

  for (const file of files) {
    if (file.comments.length === 0) continue;

    const commentLines = file.comments
      .map((c) => `**Anchor:** ${c.anchor.text}\n**Comment:** ${c.body}`)
      .join('\n\n');

    sections.push(`# File: ${file.filename}\n\n${commentLines}`);
  }

  if (sections.length === 0) return '';

  return PREAMBLE + sections.join('\n\n---\n\n');
}
