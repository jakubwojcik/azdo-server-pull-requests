import * as vscode from 'vscode';
import type { PullRequest } from './client.ts';
import { groupByRepository, type RepositoryGroup } from './pullRequests.ts';

type Node = RepositoryGroup | PullRequest;

const VOTES: Record<number, { label: string; color?: string }> = {
  10: { label: 'Approved', color: 'charts.green' },
  5: { label: 'Approved with suggestions', color: 'charts.green' },
  0: { label: 'No vote' },
  [-5]: { label: 'Waiting for author', color: 'charts.yellow' },
  [-10]: { label: 'Rejected', color: 'charts.red' },
};

function repositoryItem({ repository }: RepositoryGroup) {
  const item = new vscode.TreeItem(
    repository.name,
    vscode.TreeItemCollapsibleState.Expanded,
  );
  item.description = repository.project.name;
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
  );
  item.description = `!${pullRequest.pullRequestId} · ${author} · ${vote.label}`;
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

export function createAssignedTree() {
  const changed = new vscode.EventEmitter<void>();
  let groups: RepositoryGroup[] = [];
  let userId = '';

  const provider: vscode.TreeDataProvider<Node> = {
    onDidChangeTreeData: changed.event,
    getChildren: (node) =>
      !node ? groups : 'pullRequests' in node ? node.pullRequests : [],
    getTreeItem: (node) =>
      'pullRequests' in node
        ? repositoryItem(node)
        : pullRequestItem(node, userId),
  };

  return {
    provider,
    dispose: () => changed.dispose(),
    show(pullRequests: PullRequest[], currentUserId: string) {
      groups = groupByRepository(pullRequests);
      userId = currentUserId;
      changed.fire();
    },
  };
}
