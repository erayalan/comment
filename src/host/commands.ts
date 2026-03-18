// src/host/commands.ts
// VS Code command handlers for:
//   comment.copyAndSave    — assemble prompt, copy to clipboard, write revision file
//   comment.deleteAllComments — confirm then clear all sidecars workspace-wide
//   comment.deleteRevision — confirm then delete a single revision file

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { assembleReviewPrompt } from '../core/prompt.js';
import { writeRevisionFile } from '../core/revision.js';
import { clearSidecar, readSidecar } from '../core/sidecar.js';
import { CommentPreviewPanel } from './previewPanel.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive the .md filename from a sidecar path (.{filename}.comments.json). */
function mdFilenameFromSidecar(sidecarFsPath: string): string {
  const base = path.basename(sidecarFsPath); // .file.md.comments.json
  return base.slice(1).replace(/\.comments\.json$/, ''); // file.md
}

// ── comment.copyAndSave ───────────────────────────────────────────────────────

export async function copyAndSave(): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage('No workspace folder open.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Find all sidecar files in the workspace
  const sidecarUris = await vscode.workspace.findFiles('**/.*.comments.json', null);

  // For each sidecar, read comments only (no .md file content needed)
  const fileInputs = await Promise.all(
    sidecarUris.map(async (uri) => {
      const sidecar = await readSidecar(uri.fsPath);
      return {
        filename: mdFilenameFromSidecar(uri.fsPath),
        comments: sidecar.comments,
      };
    }),
  );

  // Guard: no comments anywhere
  const hasComments = fileInputs.some((f) => f.comments.length > 0);
  if (!hasComments) {
    vscode.window.showInformationMessage('No comments found.');
    return;
  }

  const prompt = assembleReviewPrompt(fileInputs);

  // Write revision file
  const revisionsDir = path.join(workspaceRoot, 'CommentRevisions');
  let revisionPath: string;
  try {
    const result = await writeRevisionFile(revisionsDir, prompt);
    revisionPath = result.path;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `Comment: Could not write revision file to ${revisionsDir}: ${msg}`,
    );
    return;
  }

  // Copy to clipboard
  await vscode.env.clipboard.writeText(prompt);

  vscode.window.showInformationMessage(
    `Your comments have been copied to the clipboard and saved to ${path.relative(workspaceRoot, revisionPath)}`,
  );
}

// ── comment.deleteRevision ────────────────────────────────────────────────────

export async function deleteRevision(item: { filePath: string }): Promise<void> {
  const answer = await vscode.window.showWarningMessage(
    `Delete ${path.basename(item.filePath)}?`,
    { modal: true },
    'Delete',
  );

  if (answer !== 'Delete') {
    return;
  }

  await fs.promises.unlink(item.filePath);
}

// ── comment.deleteAllComments ─────────────────────────────────────────────────

export async function deleteAllComments(): Promise<void> {
  const answer = await vscode.window.showWarningMessage(
    'Do you really want to delete all your comments in all your files? Make sure to Copy and Save your Comments first.',
    'Delete All',
    'Cancel',
  );

  if (answer !== 'Delete All') {
    return;
  }

  const sidecarUris = await vscode.workspace.findFiles('**/.*.comments.json', null);

  await Promise.all(sidecarUris.map((uri) => clearSidecar(uri.fsPath)));

  // Refresh the active preview so highlights and gutter cards disappear immediately
  await CommentPreviewPanel.refresh();

  vscode.window.showInformationMessage(
    `Deleted all comments (${sidecarUris.length} file${sidecarUris.length === 1 ? '' : 's'} cleared).`,
  );
}
