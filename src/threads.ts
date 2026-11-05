import type { AzdoClient, PullRequest } from './client.ts';

interface Position {
  line: number;
  offset: number;
}

interface IterationRange {
  firstComparingIteration: number;
  secondComparingIteration: number;
}

export interface ThreadComment {
  id: number;
  author: { id: string; displayName: string };
  usersLiked?: { id: string }[];
  content?: string;
  publishedDate?: string;
  lastContentUpdatedDate?: string;
  isDeleted?: boolean;
}

export interface Thread {
  id: number;
  status?: string;
  isDeleted?: boolean;
  comments: ThreadComment[];
  threadContext?: {
    filePath: string;
    leftFileStart?: Position | null;
    leftFileEnd?: Position | null;
    rightFileStart?: Position | null;
    rightFileEnd?: Position | null;
  } | null;
  pullRequestThreadContext?: {
    iterationContext?: IterationRange | null;
    trackingCriteria?: IterationRange | null;
  } | null;
}

export type Side = 'left' | 'right';
type Lines = { start: number; end: number };

export interface FileThread {
  thread: Thread;
  comments: ThreadComment[];
  side: Side;
  lines?: Lines;
  outdated: boolean;
}

export const STATUSES = [
  { name: 'active', code: 1, label: 'Active', resolved: false },
  { name: 'fixed', code: 2, label: 'Fixed', resolved: true },
  { name: 'wontFix', code: 3, label: "Won't fix", resolved: true },
  { name: 'closed', code: 4, label: 'Closed', resolved: true },
  { name: 'byDesign', code: 5, label: 'By design', resolved: true },
  { name: 'pending', code: 6, label: 'Pending', resolved: false },
];

export const threadsPath = ({ pullRequestId, repository }: PullRequest) =>
  `${repository.project.id}/_apis/git/repositories/${repository.id}/pullRequests/${pullRequestId}/threads`;

export function fileThreads(
  threads: Thread[],
  path: string,
  iteration: number,
): FileThread[] {
  return threads.flatMap((thread) => {
    const context = thread.threadContext;
    const comments = thread.comments.filter((comment) => !comment.isDeleted);
    if (thread.isDeleted || context?.filePath !== path || !comments.length) {
      return [];
    }
    const { iterationContext, trackingCriteria } =
      thread.pullRequestThreadContext ?? {};
    // ADR-0002: the server sets trackingCriteria only on Threads it re-anchored.
    const outdated =
      !trackingCriteria &&
      (iterationContext?.secondComparingIteration ?? iteration) < iteration;
    const side =
      context.rightFileStart || !context.leftFileStart ? 'right' : 'left';
    const start = context[`${side}FileStart`];
    const end = context[`${side}FileEnd`] ?? start;
    const lines =
      start && end && !outdated
        ? { start: start.line, end: end.line }
        : undefined;
    return [{ thread, comments, side, lines, outdated }];
  });
}

export async function fetchThreads(
  client: AzdoClient,
  pullRequest: PullRequest,
  iteration: number,
) {
  const { value } = await client.get<{ value: Thread[] }>(
    threadsPath(pullRequest),
    { $iteration: String(iteration), $baseIteration: '0' },
  );
  return value;
}

export function newThread(
  content: string,
  anchor: {
    path: string;
    changeTrackingId: number;
    iteration: number;
    side: Side;
    lines: Lines;
  },
) {
  const { path, changeTrackingId, iteration, side, lines } = anchor;
  return {
    comments: [{ parentCommentId: 0, content, commentType: 1 }],
    status: 1,
    threadContext: {
      filePath: path,
      [`${side}FileStart`]: { line: lines.start, offset: 1 },
      [`${side}FileEnd`]: { line: lines.end, offset: 1 },
    },
    pullRequestThreadContext: {
      changeTrackingId,
      iterationContext: {
        firstComparingIteration: iteration,
        secondComparingIteration: iteration,
      },
    },
  };
}
