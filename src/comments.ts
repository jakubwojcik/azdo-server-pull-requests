import * as vscode from 'vscode';
import type { AzdoClient } from './client.ts';
import { changeKind } from './changes.ts';
import type { ChangeUris, PullRequestChange } from './diffEditor.ts';
import {
  fetchThreads,
  fileThreads,
  newThread,
  STATUSES,
  threadsPath,
  type FileThread,
  type Side,
} from './threads.ts';

export interface Session {
  client: AzdoClient;
  userId: string;
}

interface Target {
  entry: PullRequestChange;
  uris: ChangeUris;
}

interface ThreadRef {
  target: Target;
  id: number;
  rootCommentId: number;
}

interface PullRequestComment extends vscode.Comment {
  thread: vscode.CommentThread;
  commentId: number;
  content: string;
}

const PREFIX = 'azdoServerPullRequests';

const statusCode = (name: string) =>
  STATUSES.find((status) => status.name === name)?.code;

export function registerComments(
  getSession: () => Session | undefined,
  report: (error: unknown) => unknown,
  likeIcon: vscode.Uri,
) {
  const controller = vscode.comments.createCommentController(
    PREFIX,
    'Azure DevOps Server',
  );
  const documents = new Map<string, { target: Target; side: Side }>();
  const shownByChange = new Map<string, vscode.CommentThread[]>();
  const refs = new WeakMap<vscode.CommentThread, ThreadRef>();

  function render(
    { thread, comments, lines, outdated }: FileThread,
    uri: vscode.Uri,
    userId: string,
  ) {
    const status = STATUSES.find(({ name }) => name === thread.status) ?? {
      label: 'Unknown',
      resolved: true,
    };
    const created = controller.createCommentThread(
      uri,
      new vscode.Range((lines?.start ?? 1) - 1, 0, (lines?.end ?? 1) - 1, 0),
      [],
    );
    created.comments = comments.map((comment): PullRequestComment => ({
      thread: created,
      commentId: comment.id,
      content: comment.content ?? '',
      body: new vscode.MarkdownString(comment.content ?? ''),
      mode: vscode.CommentMode.Preview,
      author: { name: comment.author.displayName },
      contextValue: comment.author.id === userId ? 'own' : undefined,
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
      reactions: [
        {
          label: 'Like',
          iconPath: likeIcon,
          count: comment.usersLiked?.length ?? 0,
          authorHasReacted: !!comment.usersLiked?.some(
            (user) => user.id === userId,
          ),
        },
      ],
    }));
    if (!lines) created.range = undefined;
    created.label = outdated ? `${status.label} · Outdated` : status.label;
    created.contextValue = status.resolved ? 'resolved' : 'unresolved';
    created.state = status.resolved
      ? vscode.CommentThreadState.Resolved
      : vscode.CommentThreadState.Unresolved;
    created.collapsibleState = status.resolved
      ? vscode.CommentThreadCollapsibleState.Collapsed
      : vscode.CommentThreadCollapsibleState.Expanded;
    return created;
  }

  async function show(session: Session, target: Target) {
    const { entry, uris } = target;
    for (const side of ['left', 'right'] as const) {
      documents.set(uris[side].toString(), { target, side });
    }
    const threads = await fetchThreads(
      session.client,
      entry.pullRequest,
      entry.iteration,
    );
    const kind = changeKind(entry.changeType);
    const sideOf = (side: Side) =>
      kind === 'added' ? 'right' : kind === 'deleted' ? 'left' : side;
    const key = `${entry.pullRequest.repository.id}/${entry.pullRequest.pullRequestId}${entry.item.path}`;
    shownByChange.get(key)?.forEach((thread) => thread.dispose());
    shownByChange.set(
      key,
      fileThreads(threads, entry.item.path, entry.iteration).map(
        (fileThread) => {
          const created = render(
            fileThread,
            uris[sideOf(fileThread.side)],
            session.userId,
          );
          refs.set(created, {
            target,
            id: fileThread.thread.id,
            rootCommentId: fileThread.comments[0].id,
          });
          return created;
        },
      ),
    );
  }

  async function mutate(
    target: Target,
    action: (client: AzdoClient, path: string) => Promise<unknown>,
  ) {
    const session = getSession();
    if (!session) return false;
    try {
      await action(session.client, threadsPath(target.entry.pullRequest));
    } catch (error) {
      void report(error);
      return false;
    }
    await show(session, target).catch(report);
    return true;
  }

  const onThread =
    (status: () => Promise<number | undefined>) =>
    async (thread: vscode.CommentThread) => {
      const ref = refs.get(thread);
      const code = ref && (await status());
      if (ref && code) {
        await mutate(ref.target, (client, path) =>
          client.send('PATCH', `${path}/${ref.id}`, { status: code }),
        );
      }
    };

  const onComment =
    (
      action: (
        comment: PullRequestComment,
        client: AzdoClient,
        path: string,
      ) => Promise<unknown>,
    ) =>
    async (comment: PullRequestComment) => {
      const ref = refs.get(comment.thread);
      if (ref) {
        await mutate(ref.target, (client, path) =>
          action(
            comment,
            client,
            `${path}/${ref.id}/comments/${comment.commentId}`,
          ),
        );
      }
    };

  controller.commentingRangeProvider = {
    provideCommentingRanges: (document) =>
      documents.has(document.uri.toString())
        ? [new vscode.Range(0, 0, document.lineCount - 1, 0)]
        : [],
  };

  controller.reactionHandler = async (comment, reaction) =>
    onComment((_, client, path) =>
      client.send(
        reaction.authorHasReacted ? 'DELETE' : 'POST',
        `${path}/likes`,
      ),
    )(comment as PullRequestComment);

  async function reply({ thread, text }: vscode.CommentReply) {
    const ref = refs.get(thread);
    if (ref) {
      await mutate(ref.target, (client, path) =>
        client.send('POST', `${path}/${ref.id}/comments`, {
          content: text,
          parentCommentId: ref.rootCommentId,
          commentType: 1,
        }),
      );
      return;
    }
    const doc = documents.get(thread.uri.toString());
    if (!doc || !thread.range) return;
    const { target, side } = doc;
    const { entry } = target;
    const created = await mutate(target, (client, path) =>
      client.send(
        'POST',
        path,
        newThread(text, {
          path: entry.item.path,
          changeTrackingId: entry.changeTrackingId,
          iteration: entry.iteration,
          side,
          lines: {
            start: thread.range!.start.line + 1,
            end: thread.range!.end.line + 1,
          },
        }),
      ),
    );
    if (created) thread.dispose();
  }

  function setMode(comment: PullRequestComment, mode: vscode.CommentMode) {
    comment.mode = mode;
    comment.body = new vscode.MarkdownString(comment.content);
    comment.thread.comments = [...comment.thread.comments];
  }

  return {
    show: (entry: PullRequestChange, uris: ChangeUris) => {
      const session = getSession();
      if (session) void show(session, { entry, uris }).catch(report);
    },
    disposable: vscode.Disposable.from(
      controller,
      vscode.commands.registerCommand(`${PREFIX}.reply`, reply),
      vscode.commands.registerCommand(
        `${PREFIX}.editComment`,
        (comment: PullRequestComment) =>
          setMode(comment, vscode.CommentMode.Editing),
      ),
      vscode.commands.registerCommand(
        `${PREFIX}.saveComment`,
        onComment(({ body }, client, path) =>
          client.send('PATCH', path, {
            content: typeof body === 'string' ? body : body.value,
          }),
        ),
      ),
      vscode.commands.registerCommand(
        `${PREFIX}.cancelEdit`,
        (comment: PullRequestComment) =>
          setMode(comment, vscode.CommentMode.Preview),
      ),
      vscode.commands.registerCommand(
        `${PREFIX}.deleteComment`,
        async (comment: PullRequestComment) => {
          const confirmed = await vscode.window.showWarningMessage(
            'Delete this Comment?',
            { modal: true },
            'Delete',
          );
          if (confirmed) {
            await onComment((_, client, path) => client.send('DELETE', path))(
              comment,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        `${PREFIX}.resolveThread`,
        onThread(async () => statusCode('fixed')),
      ),
      vscode.commands.registerCommand(
        `${PREFIX}.reactivateThread`,
        onThread(async () => statusCode('active')),
      ),
      vscode.commands.registerCommand(
        `${PREFIX}.changeThreadStatus`,
        onThread(async () => {
          const picked = await vscode.window.showQuickPick(
            STATUSES.filter(({ name }) => name !== 'byDesign'),
            { title: 'Change Thread Status' },
          );
          return picked?.code;
        }),
      ),
    ),
  };
}
