import * as vscode from 'vscode';
import type { PullRequest } from './client.ts';
import type { Session } from './comments.ts';
import { pullRequestPath, webUrl } from './pullRequests.ts';
import { newThread, threadsPath } from './threads.ts';

const PREFIX = 'azdoServerPullRequests';

const VOTES = {
  approve: 10,
  approveWithSuggestions: 5,
  waitForAuthor: -5,
  reject: -10,
  resetVote: 0,
};

export function registerPullRequestActions(
  getSession: () => Session | undefined,
  report: (error: unknown) => unknown,
  refresh: () => Promise<void>,
) {
  const action =
    (
      run: (session: Session, pullRequest: PullRequest) => PromiseLike<unknown>,
    ) =>
    async ({ pullRequest }: { pullRequest: PullRequest }) => {
      const session = getSession();
      if (!session) return;
      try {
        await run(session, pullRequest);
      } catch (error) {
        void report(error);
      }
    };

  return vscode.Disposable.from(
    ...Object.entries(VOTES).map(([name, vote]) =>
      vscode.commands.registerCommand(
        `${PREFIX}.${name}`,
        action(async ({ client, userId }, pullRequest) => {
          await client.send(
            'PUT',
            `${pullRequestPath(pullRequest)}/reviewers/${userId}`,
            { vote },
          );
          await refresh();
        }),
      ),
    ),
    vscode.commands.registerCommand(
      `${PREFIX}.startGeneralThread`,
      action(async ({ client }, pullRequest) => {
        const content = await vscode.window.showInputBox({
          title: `Start General Thread on !${pullRequest.pullRequestId}`,
          prompt: 'First Comment, Markdown supported',
          ignoreFocusOut: true,
        });
        if (content?.trim()) {
          await client.send(
            'POST',
            threadsPath(pullRequest),
            newThread(content),
          );
        }
      }),
    ),
    vscode.commands.registerCommand(
      `${PREFIX}.openInBrowser`,
      action(({ client }, pullRequest) =>
        vscode.env.openExternal(
          vscode.Uri.parse(webUrl(client.collectionUrl, pullRequest)),
        ),
      ),
    ),
    vscode.commands.registerCommand(
      `${PREFIX}.copyUrl`,
      action(({ client }, pullRequest) =>
        vscode.env.clipboard.writeText(
          webUrl(client.collectionUrl, pullRequest),
        ),
      ),
    ),
  );
}
