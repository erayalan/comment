import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class MarkdownItem extends vscode.TreeItem {
  constructor(
    public readonly resourceUri: vscode.Uri,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isDirectory: boolean,
  ) {
    super(resourceUri, collapsibleState);
    if (!isDirectory) {
      this.command = {
        command: 'comment.openPreview',
        title: 'Open Markdown Preview',
        arguments: [resourceUri],
      };
      this.iconPath = new vscode.ThemeIcon('markdown');
      this.contextValue = 'markdownFile';
    }
    this.tooltip = resourceUri.fsPath;
  }
}

export class MarkdownFileTree implements vscode.TreeDataProvider<MarkdownItem> {
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<MarkdownItem | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<MarkdownItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private readonly _watcher: vscode.FileSystemWatcher;

  constructor(private readonly workspaceRoot: string) {
    this._watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    this._watcher.onDidCreate(() => this._onDidChangeTreeData.fire());
    this._watcher.onDidDelete(() => this._onDidChangeTreeData.fire());
    this._watcher.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  dispose(): void {
    this._watcher.dispose();
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: MarkdownItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MarkdownItem): MarkdownItem[] {
    const dir = element ? element.resourceUri.fsPath : this.workspaceRoot;
    return this._buildItems(dir);
  }

  private _buildItems(dir: string): MarkdownItem[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const items: MarkdownItem[] = [];
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'CommentRevisions') {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const uri = vscode.Uri.file(fullPath);

      if (entry.isDirectory()) {
        if (this._directoryHasMarkdown(fullPath)) {
          items.push(
            new MarkdownItem(uri, vscode.TreeItemCollapsibleState.Collapsed, true),
          );
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        items.push(new MarkdownItem(uri, vscode.TreeItemCollapsibleState.None, false));
      }
    }

    return items;
  }

  private _directoryHasMarkdown(dir: string): boolean {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules') {
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        return true;
      }
      if (
        entry.isDirectory() &&
        this._directoryHasMarkdown(path.join(dir, entry.name))
      ) {
        return true;
      }
    }
    return false;
  }
}
