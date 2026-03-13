// tests/unit/comment.test.ts
// Unit tests for src/core/comment.ts — runs with plain mocha + ts-node.

import * as assert from 'assert';
import { createComment, deleteComment, findComment } from '../../src/core/comment.js';
import type { CommentAnchor, Sidecar } from '../../src/core/types.js';

const ANCHOR: CommentAnchor = {
  text: 'hello world',
  sourceOffset: 5,
  contextBefore: 'foo ',
  contextAfter: ' bar',
};

describe('createComment', () => {
  it('returns a Comment with a non-empty uuid v4 id', () => {
    const c = createComment(ANCHOR, 'my comment');
    assert.ok(c.id, 'id should be truthy');
    // uuid v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    assert.match(
      c.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('returns a Comment with an ISO 8601 createdAt', () => {
    const before = Date.now();
    const c = createComment(ANCHOR, 'my comment');
    const after = Date.now();

    const ts = new Date(c.createdAt).getTime();
    assert.ok(ts >= before && ts <= after, 'createdAt should be within test window');
    assert.match(c.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('stores the provided anchor and body', () => {
    const c = createComment(ANCHOR, 'my comment');
    assert.deepStrictEqual(c.anchor, ANCHOR);
    assert.strictEqual(c.body, 'my comment');
  });

  it('throws when body is empty', () => {
    assert.throws(() => createComment(ANCHOR, ''), /empty/i);
  });

  it('throws when body is whitespace only', () => {
    assert.throws(() => createComment(ANCHOR, '   '), /empty/i);
  });

  it('generates unique ids for successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createComment(ANCHOR, 'x').id));
    assert.strictEqual(ids.size, 20);
  });
});

describe('deleteComment', () => {
  it('removes the correct comment and returns a new sidecar', () => {
    const c1 = createComment(ANCHOR, 'first');
    const c2 = createComment(ANCHOR, 'second');
    const sidecar: Sidecar = { version: 1, comments: [c1, c2] };

    const result = deleteComment(sidecar, c1.id);

    assert.strictEqual(result.comments.length, 1);
    assert.strictEqual(result.comments[0].id, c2.id);
  });

  it('returns a sidecar with no comments when the last one is deleted', () => {
    const c = createComment(ANCHOR, 'only');
    const sidecar: Sidecar = { version: 1, comments: [c] };

    const result = deleteComment(sidecar, c.id);

    assert.strictEqual(result.comments.length, 0);
  });

  it('returns an unchanged sidecar when id is not found', () => {
    const c = createComment(ANCHOR, 'existing');
    const sidecar: Sidecar = { version: 1, comments: [c] };

    const result = deleteComment(sidecar, 'nonexistent-id');

    assert.strictEqual(result.comments.length, 1);
  });

  it('does not mutate the original sidecar', () => {
    const c = createComment(ANCHOR, 'immutable');
    const sidecar: Sidecar = { version: 1, comments: [c] };
    const originalLength = sidecar.comments.length;

    deleteComment(sidecar, c.id);

    assert.strictEqual(sidecar.comments.length, originalLength);
  });
});

describe('findComment', () => {
  it('returns the comment when found', () => {
    const c = createComment(ANCHOR, 'findable');
    const sidecar: Sidecar = { version: 1, comments: [c] };

    const found = findComment(sidecar, c.id);

    assert.ok(found);
    assert.strictEqual(found.id, c.id);
  });

  it('returns undefined when not found', () => {
    const sidecar: Sidecar = { version: 1, comments: [] };
    assert.strictEqual(findComment(sidecar, 'missing'), undefined);
  });

  it('finds the correct comment among multiple', () => {
    const c1 = createComment(ANCHOR, 'a');
    const c2 = createComment(ANCHOR, 'b');
    const c3 = createComment(ANCHOR, 'c');
    const sidecar: Sidecar = { version: 1, comments: [c1, c2, c3] };

    assert.strictEqual(findComment(sidecar, c2.id)?.body, 'b');
  });
});
