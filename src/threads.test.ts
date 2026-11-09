import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeThreadCounts,
  commentLabel,
  fileThreads,
  newThread,
  type Thread,
} from './threads.ts';

const comment = {
  id: 1,
  author: { id: 'ann', displayName: 'Ann' },
  content: 'Hi',
};

function thread(overrides: Partial<Thread>): Thread {
  return {
    id: 1,
    status: 'active',
    comments: [comment],
    threadContext: { filePath: '/src/a.ts' },
    pullRequestThreadContext: {
      iterationContext: {
        firstComparingIteration: 1,
        secondComparingIteration: 3,
      },
    },
    ...overrides,
  };
}

const anchors = (threads: Thread[]) =>
  fileThreads(threads, '/src/a.ts', 3).map(({ side, lines, outdated }) => ({
    side,
    lines,
    outdated,
  }));

test('an Inline Thread on the Right Side maps to its line range on the Right', () => {
  const right = thread({
    threadContext: {
      filePath: '/src/a.ts',
      rightFileStart: { line: 5, offset: 1 },
      rightFileEnd: { line: 7, offset: 4 },
    },
  });

  assert.deepEqual(anchors([right]), [
    { side: 'right', lines: { start: 5, end: 7 }, outdated: false },
  ]);
});

test('an Inline Thread on the Left Side maps to its line range on the Left', () => {
  const left = thread({
    threadContext: {
      filePath: '/src/a.ts',
      leftFileStart: { line: 2, offset: 1 },
      leftFileEnd: { line: 2, offset: 9 },
    },
  });

  assert.deepEqual(anchors([left]), [
    { side: 'left', lines: { start: 2, end: 2 }, outdated: false },
  ]);
});

test('a Thread from an older Iteration tracked by the server keeps the re-anchored line', () => {
  const tracked = thread({
    threadContext: {
      filePath: '/src/a.ts',
      rightFileStart: { line: 48, offset: 1 },
      rightFileEnd: { line: 48, offset: 1 },
    },
    pullRequestThreadContext: {
      iterationContext: {
        firstComparingIteration: 1,
        secondComparingIteration: 1,
      },
      trackingCriteria: {
        firstComparingIteration: 0,
        secondComparingIteration: 3,
      },
    },
  });

  assert.deepEqual(anchors([tracked]), [
    { side: 'right', lines: { start: 48, end: 48 }, outdated: false },
  ]);
});

test('a Thread from an older Iteration the server could not track is file-level and outdated', () => {
  const untracked = thread({
    threadContext: {
      filePath: '/src/a.ts',
      leftFileStart: { line: 28, offset: 1 },
      leftFileEnd: { line: 28, offset: 1 },
    },
    pullRequestThreadContext: {
      iterationContext: {
        firstComparingIteration: 1,
        secondComparingIteration: 1,
      },
    },
  });

  assert.deepEqual(anchors([untracked]), [
    { side: 'left', lines: undefined, outdated: true },
  ]);
});

test('a Thread on the file without lines is file-level on the Right', () => {
  assert.deepEqual(anchors([thread({})]), [
    { side: 'right', lines: undefined, outdated: false },
  ]);
});

test('a Thread the server tracked to line 0 is file-level and outdated', () => {
  const lost = thread({
    threadContext: {
      filePath: '/src/a.ts',
      rightFileStart: { line: 0, offset: 1 },
      rightFileEnd: { line: 0, offset: 1 },
    },
    pullRequestThreadContext: {
      iterationContext: {
        firstComparingIteration: 1,
        secondComparingIteration: 1,
      },
      trackingCriteria: {
        firstComparingIteration: 3,
        secondComparingIteration: 3,
      },
    },
  });

  assert.deepEqual(anchors([lost]), [
    { side: 'right', lines: undefined, outdated: true },
  ]);
});

test('Threads on other files, General Threads and deleted Threads are skipped', () => {
  const threads = [
    thread({ threadContext: { filePath: '/src/b.ts' } }),
    thread({ threadContext: null, pullRequestThreadContext: null }),
    thread({ isDeleted: true }),
    thread({ comments: [{ ...comment, isDeleted: true }] }),
  ];

  assert.deepEqual(anchors(threads), []);
});

test('deleted Comments are dropped from a Thread', () => {
  const [mapped] = fileThreads(
    [
      thread({
        comments: [
          { ...comment, id: 1, isDeleted: true },
          { ...comment, id: 2 },
        ],
      }),
    ],
    '/src/a.ts',
    3,
  );

  assert.deepEqual(
    mapped?.comments.map((c) => c.id),
    [2],
  );
});

test('a new Inline Thread is sent the way the web UI sends it', () => {
  const body = newThread('Why?', {
    path: '/src/a.ts',
    changeTrackingId: 4,
    iteration: 3,
    side: 'left',
    lines: { start: 7, end: 9 },
  });

  assert.deepEqual(body, {
    comments: [{ parentCommentId: 0, content: 'Why?', commentType: 1 }],
    status: 1,
    threadContext: {
      filePath: '/src/a.ts',
      leftFileStart: { line: 7, offset: 1 },
      leftFileEnd: { line: 9, offset: 1 },
    },
    pullRequestThreadContext: {
      changeTrackingId: 4,
      iterationContext: {
        firstComparingIteration: 3,
        secondComparingIteration: 3,
      },
    },
  });
});

test('a General Thread has no file anchor', () => {
  assert.deepEqual(newThread('Looks good'), {
    comments: [{ parentCommentId: 0, content: 'Looks good', commentType: 1 }],
    status: 1,
  });
});

test('the Comment label marks edits and names who liked it', () => {
  const published = '2026-11-01T10:00:00Z';
  const user = (id: string) => ({ id, displayName: id.toUpperCase() });

  assert.equal(
    commentLabel({ ...comment, publishedDate: published }, 'me'),
    undefined,
  );
  assert.equal(
    commentLabel(
      {
        ...comment,
        publishedDate: published,
        lastContentUpdatedDate: '2026-11-02T10:00:00Z',
        usersLiked: [user('bob')],
      },
      'me',
    ),
    'edited · Liked by BOB',
  );
  assert.equal(
    commentLabel(
      {
        ...comment,
        usersLiked: [user('bob'), user('me'), user('cy'), user('di')],
      },
      'me',
    ),
    'Liked by you, BOB +2',
  );
});

test('active Threads are counted per file', () => {
  const counts = activeThreadCounts(
    [
      thread({}),
      thread({ id: 2 }),
      thread({ id: 3, status: 'fixed' }),
      thread({
        id: 4,
        threadContext: { filePath: '/src/b.ts' },
        status: 'pending',
      }),
      thread({ id: 5, threadContext: null }),
    ],
    3,
  );

  assert.deepEqual(
    [...counts],
    [
      ['/src/a.ts', 2],
      ['/src/b.ts', 1],
    ],
  );
});
