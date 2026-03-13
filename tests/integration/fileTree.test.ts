import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Integration tests run inside a VS Code test extension host.
// The vscode module is available at runtime via @vscode/test-electron.
import * as vscode from 'vscode';
import { MarkdownFileTree, MarkdownItem } from '../../src/host/fileTree.js';

suite('MarkdownFileTree Integration Tests', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-filetree-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('.md files appear in the tree', async () => {
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Hello');
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '# Notes');

    const tree = new MarkdownFileTree(tmpDir);
    const items: MarkdownItem[] = tree.getChildren() as MarkdownItem[];

    const names = items.map(i => path.basename(i.resourceUri.fsPath));
    assert.ok(names.includes('README.md'), 'README.md should appear in tree');
    assert.ok(names.includes('notes.md'), 'notes.md should appear in tree');

    tree.dispose();
  });

  test('non-.md files are hidden from the tree', async () => {
    fs.writeFileSync(path.join(tmpDir, 'doc.md'), '# Doc');
    fs.writeFileSync(path.join(tmpDir, 'image.png'), '');
    fs.writeFileSync(path.join(tmpDir, 'script.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{}');

    const tree = new MarkdownFileTree(tmpDir);
    const items: MarkdownItem[] = tree.getChildren() as MarkdownItem[];

    const names = items.map(i => path.basename(i.resourceUri.fsPath));
    assert.ok(!names.includes('image.png'), 'image.png should NOT appear');
    assert.ok(!names.includes('script.ts'), 'script.ts should NOT appear');
    assert.ok(!names.includes('data.json'), 'data.json should NOT appear');

    tree.dispose();
  });

  test('getChildren returns MarkdownItems with correct command', () => {
    fs.writeFileSync(path.join(tmpDir, 'file.md'), '# File');

    const tree = new MarkdownFileTree(tmpDir);
    const items: MarkdownItem[] = tree.getChildren() as MarkdownItem[];

    assert.strictEqual(items.length, 1, 'Only one .md file expected');
    const item = items[0];
    assert.ok(item.command, 'File item should have an openPreview command');
    assert.strictEqual(
      item.command?.command,
      'comment.openPreview',
      'Command should be comment.openPreview',
    );
    assert.ok(
      item.collapsibleState === vscode.TreeItemCollapsibleState.None,
      'File item should not be collapsible',
    );

    tree.dispose();
  });

  test('directories containing .md files appear as collapsible nodes', () => {
    const subDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'guide.md'), '# Guide');

    const tree = new MarkdownFileTree(tmpDir);
    const items: MarkdownItem[] = tree.getChildren() as MarkdownItem[];

    assert.strictEqual(items.length, 1, 'Only the docs/ directory should appear');
    const dir = items[0];
    assert.ok(dir.isDirectory, 'Item should be marked as a directory');
    assert.ok(
      dir.collapsibleState !== vscode.TreeItemCollapsibleState.None,
      'Directory item should be collapsible',
    );

    // Expand the directory
    const children: MarkdownItem[] = tree.getChildren(dir) as MarkdownItem[];
    assert.strictEqual(children.length, 1, 'docs/ should contain one .md file');
    assert.strictEqual(path.basename(children[0].resourceUri.fsPath), 'guide.md');

    tree.dispose();
  });
});
