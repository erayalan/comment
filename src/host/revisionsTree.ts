import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

class RevisionItem extends vscode.TreeItem {
  constructor(public readonly filePath: string) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);
    const uri = vscode.Uri.file(filePath);
    this.resourceUri = uri;
    this.command = {
      command: 'vscode.open',
      title: 'Open Revision',
      arguments: [uri],
    };
    this.iconPath = new vscode.ThemeIcon('history');
    this.tooltip = filePath;
    this.contextValue = 'revisionItem';
  }
}

export class RevisionTreeProvider implements vscode.TreeDataProvider<RevisionItem> {
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<RevisionItem | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<RevisionItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private readonly _watcher: vscode.FileSystemWatcher;

  constructor(private readonly workspaceRoot: string) {
    this._watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceRoot, 'CommentRevisions/**'),
    );
    this._watcher.onDidCreate(() => this._onDidChangeTreeData.fire());
    this._watcher.onDidDelete(() => this._onDidChangeTreeData.fire());
    this._watcher.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  dispose(): void {
    this._watcher.dispose();
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: RevisionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): RevisionItem[] {
    const dir = path.join(this.workspaceRoot, 'CommentRevisions');
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .sort((a, b) => b.name.localeCompare(a.name))
      .map((e) => new RevisionItem(path.join(dir, e.name)));
  }
}
