import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Change } from './client.ts';
import { buildFileTree, changeKind, type FileTreeNode } from './changes.ts';

function change(path: string, changeType = 'edit'): Change {
  return { changeTrackingId: 1, changeType, item: { path } };
}

function shape(nodes: FileTreeNode[]): unknown[] {
  return nodes.map((node) =>
    node.kind === 'folder' ? { [node.name]: shape(node.children) } : node.name,
  );
}

test('Changes are nested under their folders', () => {
  const tree = buildFileTree([
    change('/src/lib/client.ts'),
    change('/src/extension.ts'),
  ]);

  assert.deepEqual(shape(tree), [
    { src: [{ lib: ['client.ts'] }, 'extension.ts'] },
  ]);
});

test('folders come before files, each sorted by name', () => {
  const tree = buildFileTree([
    change('/README.md'),
    change('/src/tree.ts'),
    change('/docs/adr.md'),
    change('/LICENSE'),
    change('/src/changes.ts'),
  ]);

  assert.deepEqual(shape(tree), [
    { docs: ['adr.md'] },
    { src: ['changes.ts', 'tree.ts'] },
    'LICENSE',
    'README.md',
  ]);
});

test('change types map to added, edited, deleted and renamed', () => {
  assert.deepEqual(
    [
      'add',
      'edit',
      'delete',
      'rename',
      'edit, rename',
      'delete, sourceRename',
    ].map(changeKind),
    ['added', 'edited', 'deleted', 'renamed', 'renamed', 'deleted'],
  );
});

test('folder entries in the Changes are not listed as files', () => {
  const tree = buildFileTree([
    {
      changeTrackingId: 2,
      changeType: 'add',
      item: { path: '/src/new', isFolder: true },
    },
    change('/src/new/file.ts', 'add'),
  ]);

  assert.deepEqual(shape(tree), [{ src: [{ new: ['file.ts'] }] }]);
});
