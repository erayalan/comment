// src/core/revision.ts
// Revision file I/O — writes assembled prompts to CommentRevisions/Revision-R{N}.md.
// Zero vscode imports: platform-agnostic.

import * as fs from 'fs/promises';
import * as path from 'path';
import type { RevisionFileResult } from './types.js';

/**
 * Scan `revisionsDir` for files matching `Revision-R{N}.md` and return the
 * next available revision number (max existing N + 1, or 1 if none exist).
 * Returns 1 if the directory does not exist yet.
 */
export async function getNextRevisionNumber(revisionsDir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(revisionsDir);
  } catch {
    return 1;
  }

  const nums: number[] = [];
  for (const name of entries) {
    const m = name.match(/^Revision-R(\d+)\.md$/);
    if (m) {
      nums.push(parseInt(m[1], 10));
    }
  }

  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

/**
 * Write `content` to `CommentRevisions/Revision-R{N}.md` inside `revisionsDir`.
 * Creates the directory if it does not exist.
 * Writes atomically (tmp → rename) to prevent partial-write corruption.
 * Applies a timestamp suffix collision guard (should not occur in normal use).
 */
export async function writeRevisionFile(
  revisionsDir: string,
  content: string,
): Promise<RevisionFileResult> {
  await fs.mkdir(revisionsDir, { recursive: true });

  const n = await getNextRevisionNumber(revisionsDir);
  let targetPath = path.join(revisionsDir, `Revision-R${n}.md`);

  // Collision guard: if the target somehow already exists, append a timestamp
  try {
    await fs.access(targetPath);
    const ts = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);
    targetPath = path.join(revisionsDir, `Revision-R${n}_${ts}.md`);
  } catch {
    // File does not exist — use targetPath as-is
  }

  const tmpPath = targetPath + '.tmp';
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, targetPath);

  return { path: targetPath, revisionNumber: n };
}
