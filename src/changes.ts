import type { AzdoClient, Change, PullRequest } from './client.ts';

type Folder = { kind: 'folder'; name: string; children: FileTreeNode[] };

export type FileTreeNode =
  Folder | { kind: 'file'; name: string; change: Change };

function sort(nodes: FileTreeNode[]): FileTreeNode[] {
  for (const node of nodes) {
    if (node.kind === 'folder') sort(node.children);
  }
  return nodes.sort(
    (a, b) =>
      Number(a.kind === 'file') - Number(b.kind === 'file') ||
      a.name.localeCompare(b.name),
  );
}

export function buildFileTree(changes: Change[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  for (const change of changes.filter((change) => !change.item.isFolder)) {
    const segments = change.item.path.split('/').filter(Boolean);
    const name = segments.pop() ?? '';
    let level = root;
    for (const segment of segments) {
      let folder = level.find(
        (node): node is Folder =>
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
): Promise<Change[]> {
  const path = `${repository.project.id}/_apis/git/repositories/${repository.id}/pullRequests/${pullRequestId}/iterations`;
  const { value: iterations } = await client.get<{ value: { id: number }[] }>(
    path,
  );
  const latest = Math.max(...iterations.map((iteration) => iteration.id));
  const changes: Change[] = [];
  let skip = 0;
  for (;;) {
    const page = await client.get<{
      changeEntries: Change[];
      nextSkip?: number;
    }>(`${path}/${latest}/changes`, {
      $compareTo: '0',
      $top: '2000',
      $skip: String(skip),
    });
    changes.push(...page.changeEntries);
    if (!page.nextSkip) return changes;
    skip = page.nextSkip;
  }
}
