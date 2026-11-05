import * as vscode from 'vscode';
import type { AzdoClient, Change, PullRequest } from './client.ts';
import { changeKind } from './changes.ts';
import {
  DIFF_SCHEME,
  decodeDiffUri,
  encodeDiffUri,
  fileContent,
} from './diff.ts';

export interface PullRequestChange extends Change {
  pullRequest: PullRequest;
  baseCommit: string;
  iterationCommit: string;
}

export const OPEN_CHANGE_COMMAND = 'azdoServerPullRequests.openChange';

function openChange(entry: PullRequestChange) {
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
        `${entry.item.path.split('/').pop()} (!${pullRequestId})`,
      );
  }
}

export function registerDiffEditor(
  getClient: () => AzdoClient | undefined,
  report: (error: unknown) => unknown,
) {
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
    vscode.commands.registerCommand(OPEN_CHANGE_COMMAND, openChange),
  );
}
