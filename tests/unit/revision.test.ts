// tests/unit/revision.test.ts
import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { getNextRevisionNumber, writeRevisionFile } from '../../src/core/revision.js';

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'comment-revision-test-'));
}

describe('getNextRevisionNumber', () => {
  it('returns 1 when directory does not exist', async () => {
    const n = await getNextRevisionNumber('/nonexistent/path/that/cannot/exist');
    assert.strictEqual(n, 1);
  });

  it('returns 1 when directory is empty', async () => {
    const dir = await makeTmpDir();
    try {
      const n = await getNextRevisionNumber(dir);
      assert.strictEqual(n, 1);
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });

  it('returns 2 when Revision-R1.md exists', async () => {
    const dir = await makeTmpDir();
    try {
      await fs.writeFile(path.join(dir, 'Revision-R1.md'), 'x');
      const n = await getNextRevisionNumber(dir);
      assert.strictEqual(n, 2);
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });

  it('returns max+1 when R1 and R3 exist (gap in sequence)', async () => {
    const dir = await makeTmpDir();
    try {
      await fs.writeFile(path.join(dir, 'Revision-R1.md'), 'x');
      await fs.writeFile(path.join(dir, 'Revision-R3.md'), 'x');
      const n = await getNextRevisionNumber(dir);
      assert.strictEqual(n, 4);
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });

  it('ignores files that do not match the pattern', async () => {
    const dir = await makeTmpDir();
    try {
      await fs.writeFile(path.join(dir, 'unrelated.md'), 'x');
      await fs.writeFile(path.join(dir, 'Revision-R2.md'), 'x');
      const n = await getNextRevisionNumber(dir);
      assert.strictEqual(n, 3);
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });
});

describe('writeRevisionFile', () => {
  it('creates the directory and writes Revision-R1.md', async () => {
    const dir = await makeTmpDir();
    const revisionsDir = path.join(dir, 'CommentRevisions');
    try {
      const result = await writeRevisionFile(revisionsDir, 'prompt content');
      assert.strictEqual(result.revisionNumber, 1);
      assert.ok(result.path.endsWith('Revision-R1.md'));
      const written = await fs.readFile(result.path, 'utf8');
      assert.strictEqual(written, 'prompt content');
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });

  it('increments revision number on subsequent writes', async () => {
    const dir = await makeTmpDir();
    const revisionsDir = path.join(dir, 'CommentRevisions');
    try {
      const r1 = await writeRevisionFile(revisionsDir, 'first');
      const r2 = await writeRevisionFile(revisionsDir, 'second');
      assert.strictEqual(r1.revisionNumber, 1);
      assert.strictEqual(r2.revisionNumber, 2);
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });

  it('never overwrites pre-existing revision files', async () => {
    const dir = await makeTmpDir();
    const revisionsDir = path.join(dir, 'CommentRevisions');
    try {
      await fs.mkdir(revisionsDir, { recursive: true });
      // Pre-create R1 and R2 so the next computed revision is R3.
      await fs.writeFile(path.join(revisionsDir, 'Revision-R1.md'), 'r1-original');
      await fs.writeFile(path.join(revisionsDir, 'Revision-R2.md'), 'r2-original');

      const result = await writeRevisionFile(revisionsDir, 'new content');
      assert.strictEqual(result.revisionNumber, 3);
      assert.ok(result.path.endsWith('Revision-R3.md'));
      // Pre-existing files untouched
      assert.strictEqual(
        await fs.readFile(path.join(revisionsDir, 'Revision-R1.md'), 'utf8'),
        'r1-original',
      );
      assert.strictEqual(
        await fs.readFile(path.join(revisionsDir, 'Revision-R2.md'), 'utf8'),
        'r2-original',
      );
      assert.strictEqual(await fs.readFile(result.path, 'utf8'), 'new content');
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });
});
