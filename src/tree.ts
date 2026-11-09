import * as vscode from 'vscode';
import type { AzdoClient, PullRequest } from './client.ts';
import {
  buildFileTree,
  changeKind,
  fetchChanges,
  type FileTreeNode,
} from './changes.ts';
import { OPEN_CHANGE_COMMAND, type PullRequestChange } from './diffEditor.ts';
import { groupByRepository, type RepositoryGroup } from './pullRequests.ts';
import { changeResource, type createThreadBadges } from './threadBadges.ts';
import { fetchThreads } from './threads.ts';

type Node =
  | { kind: 'repository'; group: RepositoryGroup }
  | { kind: 'pullRequest'; pullRequest: PullRequest }
  | FileTreeNode<PullRequestChange>;

const VOTES: Record<number, { label: string; color?: string; badge?: string }> =
  {
    10: { label: 'Approved', color: 'charts.green', badge: '✓' },
    5: {
      label: 'Approved with suggestions',
      color: 'charts.green',
      badge: '✓',
    },
    0: { label: 'No vote' },
    [-5]: { label: 'Waiting for author', color: 'charts.yellow', badge: '…' },
    [-10]: { label: 'Rejected', color: 'charts.red', badge: '✗' },
  };

const VOTE_SCHEME = 'azdo-server-pr-vote';

const voteDecorations: vscode.FileDecorationProvider = {
  provideFileDecoration(uri) {
    if (uri.scheme !== VOTE_SCHEME) return;
    const { badge, label } = VOTES[Number(uri.query)] ?? VOTES[0];
    return badge ? new vscode.FileDecoration(badge, label) : undefined;
  },
};

const CHANGE_ICONS = {
  added: ['diff-added', 'gitDecoration.addedResourceForeground'],
  edited: ['diff-modified', 'gitDecoration.modifiedResourceForeground'],
  deleted: ['diff-removed', 'gitDecoration.deletedResourceForeground'],
  renamed: ['diff-renamed', 'gitDecoration.renamedResourceForeground'],
};

function repositoryItem({ repository }: RepositoryGroup) {
  const item = new vscode.TreeItem(
    repository.name,
    vscode.TreeItemCollapsibleState.Expanded,
  );
  item.description = repository.project.name;
  item.id = repository.id;
  item.iconPath = new vscode.ThemeIcon('repo');
  return item;
}

function pullRequestItem(pullRequest: PullRequest, userId: string) {
  const ownVote =
    pullRequest.reviewers.find((reviewer) => reviewer.id === userId)?.vote ?? 0;
  const vote = VOTES[ownVote] ?? VOTES[0];
  const author = pullRequest.createdBy.displayName;
  const branch = (ref: string) => ref.replace(/^refs\/heads\//, '');

  const item = new vscode.TreeItem(
    pullRequest.isDraft ? `[Draft] ${pullRequest.title}` : pullRequest.title,
    vscode.TreeItemCollapsibleState.Collapsed,
  );
  item.description = `!${pullRequest.pullRequestId} · ${author}`;
  item.id = `${pullRequest.repository.id}/${pullRequest.pullRequestId}`;
  item.resourceUri = vscode.Uri.from({
    scheme: VOTE_SCHEME,
    path: `/${item.id}`,
    query: String(ownVote),
  });
  item.contextValue = pullRequest.isDraft ? 'draftPullRequest' : 'pullRequest';
  item.iconPath = new vscode.ThemeIcon(
    pullRequest.isDraft ? 'git-pull-request-draft' : 'git-pull-request',
    vote.color ? new vscode.ThemeColor(vote.color) : undefined,
  );
  item.tooltip = new vscode.MarkdownString()
    .appendMarkdown('**')
    .appendText(pullRequest.title)
    .appendMarkdown('**')
    .appendText(pullRequest.isDraft ? ' (Draft)' : '')
    .appendMarkdown('\n\n')
    .appendText(
      `!${pullRequest.pullRequestId} by ${author}\n\n` +
        `${branch(pullRequest.sourceRefName)} → ${branch(pullRequest.targetRefName)}\n\n` +
        `Your vote: ${vote.label}`,
    );
  return item;
}

function folderItem(name: string) {
  const item = new vscode.TreeItem(
    name,
    vscode.TreeItemCollapsibleState.Expanded,
  );
  item.iconPath = vscode.ThemeIcon.Folder;
  return item;
}

function changeItem(name: string, change: PullRequestChange) {
  const [icon, color] = CHANGE_ICONS[changeKind(change.changeType)];
  const item = new vscode.TreeItem(name);
  item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
  item.description = change.originalPath;
  item.resourceUri = changeResource(change.pullRequest, change.item.path);
  item.tooltip = change.item.path;
  item.command = {
    command: OPEN_CHANGE_COMMAND,
    title: 'Open Change',
    arguments: [change],
  };
  return item;
}

export function createAssignedTree(
  getClient: () => AzdoClient | undefined,
  report: (error: unknown) => unknown,
  badges: ReturnType<typeof createThreadBadges>,
) {
  const changed = new vscode.EventEmitter<void>();
  const disposable = vscode.Disposable.from(
    changed,
    vscode.window.registerFileDecorationProvider(voteDecorations),
  );
  let groups: RepositoryGroup[] = [];
  let userId = '';

  async function changes(pullRequest: PullRequest): Promise<Node[]> {
    const client = getClient();
    if (!client) return [];
    try {
      const { iteration, baseCommit, iterationCommit, changes } =
        await fetchChanges(client, pullRequest);
      void fetchThreads(client, pullRequest, iteration)
        .then((threads) => badges.update(pullRequest, iteration, threads))
        .catch(report);
      return buildFileTree(
        changes.map((change) => ({
          ...change,
          pullRequest,
          iteration,
          baseCommit,
          iterationCommit,
        })),
      );
    } catch (error) {
      void report(error);
      return [];
    }
  }

  const provider: vscode.TreeDataProvider<Node> = {
    onDidChangeTreeData: changed.event,
    getChildren(node) {
      if (!node) {
        return groups.map((group) => ({ kind: 'repository', group }));
      }
      switch (node.kind) {
        case 'repository':
          return node.group.pullRequests.map((pullRequest) => ({
            kind: 'pullRequest',
            pullRequest,
          }));
        case 'pullRequest':
          return changes(node.pullRequest);
        case 'folder':
          return node.children;
        case 'file':
          return [];
      }
    },
    getTreeItem(node) {
      switch (node.kind) {
        case 'repository':
          return repositoryItem(node.group);
        case 'pullRequest':
          return pullRequestItem(node.pullRequest, userId);
        case 'folder':
          return folderItem(node.name);
        case 'file':
          return changeItem(node.name, node.change);
      }
    },
  };

  return {
    provider,
    dispose: () => disposable.dispose(),
    show(pullRequests: PullRequest[], currentUserId: string) {
      groups = groupByRepository(pullRequests);
      userId = currentUserId;
      changed.fire();
    },
    clear() {
      groups = [];
      changed.fire();
    },
  };
}
