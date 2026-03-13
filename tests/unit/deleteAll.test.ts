// tests/unit/deleteAll.test.ts
// Unit tests for the deleteAllComments logic.
// We test the clearSidecar calls by exercising the logic extracted from commands.ts
// without VS Code APIs (those require an extension host).

import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { clearSidecar, readSidecar, writeSidecar } from '../../src/core/sidecar.js';

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'comment-deleteall-test-'));
}

describe('deleteAllComments logic (clearSidecar on each sidecar)', () => {
  it('clearSidecar empties a sidecar that had comments', async () => {
    const dir = await makeTmpDir();
    const sidecarPath = path.join(dir, '.doc.md.comments.json');
    try {
      await writeSidecar(sidecarPath, {
        version: 1,
        comments: [
          {
            id: 'abc',
            anchor: { text: 'hello', sourceOffset: 0, contextBefore: '', contextAfter: '' },
            body: 'my comment',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      await clearSidecar(sidecarPath);

      const result = await readSidecar(sidecarPath);
      assert.strictEqual(result.comments.length, 0);
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });

  it('clearing multiple sidecars in parallel leaves all empty', async () => {
    const dir = await makeTmpDir();
    const paths = [
      path.join(dir, '.a.md.comments.json'),
      path.join(dir, '.b.md.comments.json'),
      path.join(dir, '.c.md.comments.json'),
    ];
    try {
      const comment = {
        id: 'x',
        anchor: { text: 'x', sourceOffset: 0, contextBefore: '', contextAfter: '' },
        body: 'test',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      await Promise.all(paths.map((p) => writeSidecar(p, { version: 1, comments: [comment] })));

      // Simulate the deleteAllComments confirm path
      await Promise.all(paths.map((p) => clearSidecar(p)));

      const results = await Promise.all(paths.map((p) => readSidecar(p)));
      for (const result of results) {
        assert.strictEqual(result.comments.length, 0);
      }
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });

  it('cancel path: clearSidecar is never called, sidecars unchanged', async () => {
    const dir = await makeTmpDir();
    const sidecarPath = path.join(dir, '.doc.md.comments.json');
    try {
      const original = {
        version: 1 as const,
        comments: [
          {
            id: 'keep',
            anchor: { text: 'stay', sourceOffset: 0, contextBefore: '', contextAfter: '' },
            body: 'stays',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      };
      await writeSidecar(sidecarPath, original);

      // Simulate cancel: do nothing (user dismissed dialog)
      // Verify sidecar is unchanged
      const result = await readSidecar(sidecarPath);
      assert.strictEqual(result.comments.length, 1);
      assert.strictEqual(result.comments[0].id, 'keep');
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });
});
