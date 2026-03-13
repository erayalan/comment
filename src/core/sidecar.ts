// src/core/sidecar.ts
// Sidecar JSON file I/O — platform-agnostic (zero vscode imports).
// Sidecar files are named `.{filename}.comments.json` in the same directory
// as the .md file they annotate.

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Comment, Sidecar } from './types.js';

const EMPTY_SIDECAR: Sidecar = { version: 1, comments: [] };

/**
 * Read a sidecar file from disk. Returns an empty sidecar when:
 *   - the file does not exist, OR
 *   - the file contains invalid JSON.
 * Invalid individual comment entries are silently dropped; a warning is logged
 * per dropped entry. The sidecar is still returned with the remaining valid
 * comments.
 */
export async function readSidecar(filePath: string): Promise<Sidecar> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if (_isNodeError(err) && err.code === 'ENOENT') {
      // File does not exist — treat as empty sidecar
      return { version: 1, comments: [] };
    }
    // Other read errors — treat as empty sidecar
    console.warn(`[comment] Failed to read sidecar ${filePath}:`, err);
    return { version: 1, comments: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[comment] Sidecar ${filePath} contains invalid JSON — treating as empty.`);
    return { version: 1, comments: [] };
  }

  if (!_isRawSidecar(parsed)) {
    console.warn(`[comment] Sidecar ${filePath} has invalid structure — treating as empty.`);
    return { version: 1, comments: [] };
  }

  // Validate individual comment entries; drop invalid ones
  const valid: Comment[] = [];
  for (const entry of parsed.comments) {
    if (_isValidComment(entry)) {
      valid.push(entry as Comment);
    } else {
      console.warn(`[comment] Dropping invalid comment entry in ${filePath}:`, entry);
    }
  }

  return { version: 1, comments: valid };
}

/**
 * Write `sidecar` to `filePath` atomically by writing to a `.tmp` file then
 * renaming it into place. This prevents partial-write corruption.
 */
export async function writeSidecar(filePath: string, sidecar: Sidecar): Promise<void> {
  const tmpPath = filePath + '.tmp';
  const json = JSON.stringify(sidecar, null, 2);
  await fs.writeFile(tmpPath, json, 'utf8');
  await fs.rename(tmpPath, filePath);
}

/**
 * Overwrite `filePath` with an empty sidecar (`{ version: 1, comments: [] }`).
 */
export async function clearSidecar(filePath: string): Promise<void> {
  await writeSidecar(filePath, { version: 1, comments: [] });
}

/**
 * Derive the sidecar file path for a given .md file path.
 * Example: `/workspace/docs/guide.md` → `/workspace/docs/.guide.md.comments.json`
 */
export function getSidecarPath(mdFilePath: string): string {
  const dir = path.dirname(mdFilePath);
  const base = path.basename(mdFilePath);
  return path.join(dir, `.${base}.comments.json`);
}

// ── Validators ────────────────────────────────────────────────────────────────

interface RawSidecar {
  version: unknown;
  comments: unknown[];
}

function _isRawSidecar(value: unknown): value is RawSidecar {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['version'] === 'number' &&
    (obj['version'] as number) > 0 &&
    Array.isArray(obj['comments'])
  );
}

function _isValidComment(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) return false;
  const c = entry as Record<string, unknown>;

  // Top-level fields
  if (typeof c['id'] !== 'string' || c['id'].length === 0) return false;
  if (typeof c['body'] !== 'string' || c['body'].length === 0) return false;
  if (typeof c['createdAt'] !== 'string' || c['createdAt'].length === 0) return false;

  // anchor object
  const anchor = c['anchor'];
  if (typeof anchor !== 'object' || anchor === null) return false;
  const a = anchor as Record<string, unknown>;
  if (typeof a['text'] !== 'string' || a['text'].length === 0) return false;
  if (typeof a['sourceOffset'] !== 'number' || a['sourceOffset'] < 0) return false;
  if (typeof a['contextBefore'] !== 'string') return false;
  if (typeof a['contextAfter'] !== 'string') return false;

  return true;
}

function _isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

// Re-export EMPTY_SIDECAR for testing convenience
export { EMPTY_SIDECAR };
