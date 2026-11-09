import * as vscode from 'vscode';
import type { PullRequest } from './client.ts';
import { activeThreadCounts, type Thread } from './threads.ts';

const SCHEME = 'azdo-server-pr-change';

const key = ({ pullRequestId, repository }: PullRequest) =>
  `${repository.id}/${pullRequestId}`;

export const changeResource = (pullRequest: PullRequest, path: string) =>
  vscode.Uri.from({ scheme: SCHEME, path: `/${key(pullRequest)}${path}` });

export function createThreadBadges() {
  const changed = new vscode.EventEmitter<undefined>();
  const counts = new Map<string, Map<string, number>>();
  const provider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: changed.event,
    provideFileDecoration(uri) {
      if (uri.scheme !== SCHEME) return;
      const [repository, pullRequestId, ...path] = uri.path.slice(1).split('/');
      const count = counts
        .get(`${repository}/${pullRequestId}`)
        ?.get(`/${path.join('/')}`);
      if (!count) return;
      return new vscode.FileDecoration(
        String(Math.min(count, 99)),
        `${count} active Thread${count === 1 ? '' : 's'}`,
      );
    },
  };
  return {
    update(pullRequest: PullRequest, iteration: number, threads: Thread[]) {
      counts.set(key(pullRequest), activeThreadCounts(threads, iteration));
      changed.fire(undefined);
    },
    disposable: vscode.Disposable.from(
      changed,
      vscode.window.registerFileDecorationProvider(provider),
    ),
  };
}
