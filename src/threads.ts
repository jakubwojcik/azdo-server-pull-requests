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
  author: { displayName: string };
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

export interface FileThread {
  thread: Thread;
  comments: ThreadComment[];
  side: 'left' | 'right';
  lines?: { start: number; end: number };
  outdated: boolean;
}

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
  { pullRequestId, repository }: PullRequest,
  iteration: number,
) {
  const { value } = await client.get<{ value: Thread[] }>(
    `${repository.project.id}/_apis/git/repositories/${repository.id}/pullRequests/${pullRequestId}/threads`,
    { $iteration: String(iteration), $baseIteration: '0' },
  );
  return value;
}
