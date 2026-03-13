import * as vscode from 'vscode';
import { copyAndSave, deleteAllComments, deleteRevision } from './commands.js';
import { MarkdownFileTree } from './fileTree.js';
import { RevisionTreeProvider } from './revisionsTree.js';
import { CommentPreviewPanel } from './previewPanel.js';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Hide CommentRevisions/ from Explorer via workspace files.exclude
  const filesConfig = vscode.workspace.getConfiguration('files');
  const exclude = filesConfig.get<Record<string, boolean>>('exclude') ?? {};
  if (!exclude['CommentRevisions/']) {
    exclude['CommentRevisions/'] = true;
    void filesConfig.update('exclude', exclude, vscode.ConfigurationTarget.Workspace);
  }

  // Register sidebar file tree (US1)
  const fileTree = new MarkdownFileTree(workspaceRoot);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('comment-file-tree', fileTree),
  );

  // Register revisions tree
  const revisionTree = new RevisionTreeProvider(workspaceRoot);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('comment-revisions-tree', revisionTree),
  );

  // comment.openPreview — opens/reveals the preview panel for a given .md file
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'comment.openPreview',
      (uri?: vscode.Uri) => {
        const filePath = uri?.fsPath;
        CommentPreviewPanel.createOrShow(context, filePath);
      },
    ),
  );

  // comment.copyAndSave — assemble prompt from all commented files, copy + save (US3)
  context.subscriptions.push(
    vscode.commands.registerCommand('comment.copyAndSave', () => {
      void copyAndSave();
    }),
  );

  // comment.deleteAllComments — confirm then clear all sidecars workspace-wide (US4)
  context.subscriptions.push(
    vscode.commands.registerCommand('comment.deleteAllComments', () => {
      void deleteAllComments();
    }),
  );

  // comment.deleteRevision — confirm then delete a single revision file
  context.subscriptions.push(
    vscode.commands.registerCommand('comment.deleteRevision', (item) => {
      void deleteRevision(item);
    }),
  );
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions in activate()
}
