import type { AzdoClient, Change, PullRequest } from './client.ts';

type Folder<T extends Change> = {
  kind: 'folder';
  name: string;
  children: FileTreeNode<T>[];
};

export type FileTreeNode<T extends Change = Change> =
  Folder<T> | { kind: 'file'; name: string; change: T };

function sort<T extends Change>(nodes: FileTreeNode<T>[]): FileTreeNode<T>[] {
  for (const node of nodes) {
    if (node.kind === 'folder') sort(node.children);
  }
  return nodes.sort(
    (a, b) =>
      Number(a.kind === 'file') - Number(b.kind === 'file') ||
      a.name.localeCompare(b.name),
  );
}

export function buildFileTree<T extends Change>(
  changes: T[],
): FileTreeNode<T>[] {
  const root: FileTreeNode<T>[] = [];
  for (const change of changes.filter((change) => !change.item.isFolder)) {
    const segments = change.item.path.split('/').filter(Boolean);
    const name = segments.pop() ?? '';
    let level = root;
    for (const segment of segments) {
      let folder = level.find(
        (node): node is Folder<T> =>
          node.kind === 'folder' && node.name === segment,
      );
      if (!folder) {
        folder = { kind: 'folder', name: segment, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
    level.push({ kind: 'file', name, change });
  }
  return sort(root);
}

export function changeKind(
  changeType: string,
): 'added' | 'edited' | 'deleted' | 'renamed' {
  const flags = changeType.split(/,\s*/);
  if (flags.includes('delete')) return 'deleted';
  if (flags.includes('add')) return 'added';
  if (flags.includes('rename')) return 'renamed';
  return 'edited';
}

export async function fetchChanges(
  client: AzdoClient,
  { pullRequestId, repository }: PullRequest,
): Promise<{
  iteration: number;
  baseCommit: string;
  iterationCommit: string;
  changes: Change[];
}> {
  const path = `${repository.project.id}/_apis/git/repositories/${repository.id}/pullRequests/${pullRequestId}/iterations`;
  const { value: iterations } = await client.get<{
    value: {
      id: number;
      sourceRefCommit: { commitId: string };
      commonRefCommit: { commitId: string };
    }[];
  }>(path);
  const latest = iterations.reduce((a, b) => (b.id > a.id ? b : a));
  const changes: Change[] = [];
  let skip = 0;
  for (;;) {
    const page = await client.get<{
      changeEntries: Change[];
      nextSkip?: number;
    }>(`${path}/${latest.id}/changes`, {
      $compareTo: '0',
      $top: '2000',
      $skip: String(skip),
    });
    changes.push(...page.changeEntries);
    if (!page.nextSkip) {
      return {
        iteration: latest.id,
        baseCommit: latest.commonRefCommit.commitId,
        iterationCommit: latest.sourceRefCommit.commitId,
        changes,
      };
    }
    skip = page.nextSkip;
  }
}
