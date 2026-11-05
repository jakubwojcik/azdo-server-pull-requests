import * as vscode from 'vscode';
import type { AzdoClient, Change, PullRequest } from './client.ts';
import { changeKind } from './changes.ts';
import {
  DIFF_SCHEME,
  decodeDiffUri,
  encodeDiffUri,
  fileContent,
} from './diff.ts';
import { fetchThreads, fileThreads, type FileThread } from './threads.ts';

export interface PullRequestChange extends Change {
  pullRequest: PullRequest;
  iteration: number;
  baseCommit: string;
  iterationCommit: string;
}

export const OPEN_CHANGE_COMMAND = 'azdoServerPullRequests.openChange';

const STATUSES: Record<string, { label: string; resolved: boolean }> = {
  active: { label: 'Active', resolved: false },
  pending: { label: 'Pending', resolved: false },
  fixed: { label: 'Fixed', resolved: true },
  wontFix: { label: "Won't fix", resolved: true },
  closed: { label: 'Closed', resolved: true },
  byDesign: { label: 'By design', resolved: true },
};

function changeUris(entry: PullRequestChange) {
  const { pullRequestId, repository } = entry.pullRequest;
  const version = (commit: string, path: string) =>
    vscode.Uri.from(
      encodeDiffUri({
        project: repository.project.name,
        repository: repository.name,
        pullRequestId,
        commit,
        path,
      }),
    );
  const left = version(entry.baseCommit, entry.originalPath ?? entry.item.path);
  const right = version(entry.iterationCommit, entry.item.path);
  return { left, right };
}

function openChange(entry: PullRequestChange) {
  const { left, right } = changeUris(entry);
  switch (changeKind(entry.changeType)) {
    case 'added':
      return vscode.commands.executeCommand('vscode.open', right);
    case 'deleted':
      return vscode.commands.executeCommand('vscode.open', left);
    default:
      return vscode.commands.executeCommand(
        'vscode.diff',
        left,
        right,
        `${entry.item.path.split('/').pop()} (!${entry.pullRequest.pullRequestId})`,
      );
  }
}

function commentThread(
  controller: vscode.CommentController,
  uri: vscode.Uri,
  { thread, comments, lines, outdated }: FileThread,
) {
  const { label, resolved } = STATUSES[thread.status ?? ''] ?? {
    label: 'Unknown',
    resolved: true,
  };
  const created = controller.createCommentThread(
    uri,
    new vscode.Range((lines?.start ?? 1) - 1, 0, (lines?.end ?? 1) - 1, 0),
    comments.map((comment) => ({
      body: new vscode.MarkdownString(comment.content ?? ''),
      mode: vscode.CommentMode.Preview,
      author: { name: comment.author.displayName },
      timestamp: comment.publishedDate
        ? new Date(comment.publishedDate)
        : undefined,
      label:
        comment.publishedDate &&
        comment.lastContentUpdatedDate &&
        new Date(comment.lastContentUpdatedDate) >
          new Date(comment.publishedDate)
          ? 'edited'
          : undefined,
    })),
  );
  if (!lines) created.range = undefined;
  created.label = outdated ? `${label} · Outdated` : label;
  created.canReply = false;
  created.state = resolved
    ? vscode.CommentThreadState.Resolved
    : vscode.CommentThreadState.Unresolved;
  created.collapsibleState = resolved
    ? vscode.CommentThreadCollapsibleState.Collapsed
    : vscode.CommentThreadCollapsibleState.Expanded;
  return created;
}

export function registerDiffEditor(
  getClient: () => AzdoClient | undefined,
  report: (error: unknown) => unknown,
) {
  const controller = vscode.comments.createCommentController(
    'azdoServerPullRequests',
    'Azure DevOps Server',
  );
  const threadsByChange = new Map<string, vscode.CommentThread[]>();

  async function showThreads(client: AzdoClient, entry: PullRequestChange) {
    const threads = await fetchThreads(
      client,
      entry.pullRequest,
      entry.iteration,
    );
    const uris = changeUris(entry);
    const kind = changeKind(entry.changeType);
    const key = `${entry.pullRequest.repository.id}/${entry.pullRequest.pullRequestId}${entry.item.path}`;
    threadsByChange.get(key)?.forEach((thread) => thread.dispose());
    threadsByChange.set(
      key,
      fileThreads(threads, entry.item.path, entry.iteration).map((thread) =>
        commentThread(
          controller,
          kind === 'added'
            ? uris.right
            : kind === 'deleted'
              ? uris.left
              : uris[thread.side],
          thread,
        ),
      ),
    );
  }

  const provider: vscode.TextDocumentContentProvider = {
    async provideTextDocumentContent(uri) {
      const client = getClient();
      if (!client) throw new Error('Not signed in to the Collection');
      const file = decodeDiffUri(uri);
      const project = encodeURIComponent(file.project);
      const repository = encodeURIComponent(file.repository);
      try {
        const bytes = await client.getBytes(
          `${project}/_apis/git/repositories/${repository}/items`,
          {
            path: file.path,
            'versionDescriptor.versionType': 'commit',
            'versionDescriptor.version': file.commit,
          },
        );
        return fileContent(
          bytes,
          `${client.collectionUrl}/${project}/_git/${repository}/pullrequest/${file.pullRequestId}?_a=files&path=${encodeURIComponent(file.path)}`,
        );
      } catch (error) {
        void report(error);
        throw error;
      }
    },
  };
  return vscode.Disposable.from(
    vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, provider),
    controller,
    vscode.commands.registerCommand(
      OPEN_CHANGE_COMMAND,
      async (entry: PullRequestChange) => {
        await openChange(entry);
        const client = getClient();
        if (client) await showThreads(client, entry).catch(report);
      },
    ),
  );
}
