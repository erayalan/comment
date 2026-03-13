// tests/unit/sidecar.test.ts
// Unit tests for src/core/sidecar.ts — runs with plain mocha + ts-node.

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { readSidecar, writeSidecar, clearSidecar, getSidecarPath } from '../../src/core/sidecar.js';
import type { Sidecar } from '../../src/core/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'comment-test-'));
}

const VALID_SIDECAR: Sidecar = {
  version: 1,
  comments: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      anchor: {
        text: 'hello',
        sourceOffset: 0,
        contextBefore: '',
        contextAfter: ' world',
      },
      body: 'A comment',
      createdAt: '2026-02-26T12:00:00.000Z',
    },
  ],
};

// ── readSidecar ───────────────────────────────────────────────────────────────

describe('readSidecar', () => {
  it('returns an empty sidecar when the file does not exist', async () => {
    const tmpDir = await makeTmpDir();
    const filePath = path.join(tmpDir, '.nonexistent.comments.json');
    const result = await readSidecar(filePath);

    assert.strictEqual(result.version, 1);
    assert.deepStrictEqual(result.comments, []);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty sidecar when the file contains invalid JSON', async () => {
    const tmpDir = await makeTmpDir();
    const filePath = path.join(tmpDir, '.bad.comments.json');
    await fs.writeFile(filePath, 'this is not json', 'utf8');

    const result = await readSidecar(filePath);

    assert.strictEqual(result.version, 1);
    assert.deepStrictEqual(result.comments, []);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns loaded sidecar when the file contains valid JSON', async () => {
    const tmpDir = await makeTmpDir();
    const filePath = path.join(tmpDir, '.valid.comments.json');
    await fs.writeFile(filePath, JSON.stringify(VALID_SIDECAR), 'utf8');

    const result = await readSidecar(filePath);

    assert.strictEqual(result.version, 1);
    assert.strictEqual(result.comments.length, 1);
    assert.strictEqual(result.comments[0].body, 'A comment');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('drops invalid comment entries and logs a warning (valid ones retained)', async () => {
    const tmpDir = await makeTmpDir();
    const filePath = path.join(tmpDir, '.mixed.comments.json');

    const raw = JSON.stringify({
      version: 1,
      comments: [
        // Valid
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          anchor: { text: 'good', sourceOffset: 0, contextBefore: '', contextAfter: '' },
          body: 'valid body',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        // Invalid: missing body
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          anchor: { text: 'bad', sourceOffset: 0, contextBefore: '', contextAfter: '' },
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        // Invalid: anchor missing text
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          anchor: { sourceOffset: 0, contextBefore: '', contextAfter: '' },
          body: 'body',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        // Invalid: empty id
        {
          id: '',
          anchor: { text: 'x', sourceOffset: 0, contextBefore: '', contextAfter: '' },
          body: 'body',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    await fs.writeFile(filePath, raw, 'utf8');

    // Capture console.warn calls
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.join(' '));

    const result = await readSidecar(filePath);

    console.warn = originalWarn;

    // Only the valid entry should be retained
    assert.strictEqual(result.comments.length, 1);
    assert.strictEqual(result.comments[0].body, 'valid body');

    // A warning should have been emitted for each dropped entry
    assert.ok(
      warnings.some((w) => w.toLowerCase().includes('invalid') || w.toLowerCase().includes('dropping')),
      'should have logged at least one warning',
    );

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

// ── writeSidecar ──────────────────────────────────────────────────────────────

describe('writeSidecar', () => {
  it('writes valid JSON to the target file', async () => {
    const tmpDir = await makeTmpDir();
    const filePath = path.join(tmpDir, '.write.comments.json');

    await writeSidecar(filePath, VALID_SIDECAR);

    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Sidecar;
    assert.strictEqual(parsed.version, 1);
    assert.strictEqual(parsed.comments.length, 1);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('uses atomic write: no .tmp file remains after success', async () => {
    const tmpDir = await makeTmpDir();
    const filePath = path.join(tmpDir, '.atomic.comments.json');
    const tmpPath = filePath + '.tmp';

    await writeSidecar(filePath, VALID_SIDECAR);

    // Target file should exist
    const stat = await fs.stat(filePath);
    assert.ok(stat.size > 0, 'target file should have content');

    // Temp file should be gone
    await assert.rejects(
      () => fs.stat(tmpPath),
      { code: 'ENOENT' },
      '.tmp file should not exist after successful write',
    );

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('overwrites an existing sidecar file', async () => {
    const tmpDir = await makeTmpDir();
    const filePath = path.join(tmpDir, '.overwrite.comments.json');

    await writeSidecar(filePath, VALID_SIDECAR);
    await writeSidecar(filePath, { version: 1, comments: [] });

    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Sidecar;
    assert.deepStrictEqual(parsed.comments, []);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

// ── clearSidecar ──────────────────────────────────────────────────────────────

describe('clearSidecar', () => {
  it('writes { version: 1, comments: [] } to the file', async () => {
    const tmpDir = await makeTmpDir();
    const filePath = path.join(tmpDir, '.clear.comments.json');

    await writeSidecar(filePath, VALID_SIDECAR);
    await clearSidecar(filePath);

    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Sidecar;
    assert.strictEqual(parsed.version, 1);
    assert.deepStrictEqual(parsed.comments, []);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates the file when it does not yet exist', async () => {
    const tmpDir = await makeTmpDir();
    const filePath = path.join(tmpDir, '.new.comments.json');

    await clearSidecar(filePath);

    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Sidecar;
    assert.deepStrictEqual(parsed, { version: 1, comments: [] });

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

// ── getSidecarPath ────────────────────────────────────────────────────────────

describe('getSidecarPath', () => {
  it('returns .{filename}.comments.json in the same directory', () => {
    const result = getSidecarPath('/workspace/docs/guide.md');
    assert.strictEqual(result, '/workspace/docs/.guide.md.comments.json');
  });

  it('handles filenames without a directory component', () => {
    const result = getSidecarPath('README.md');
    assert.strictEqual(result, path.join('.', '.README.md.comments.json'));
  });
});
