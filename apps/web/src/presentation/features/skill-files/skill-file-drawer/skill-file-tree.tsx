import { Alert, Button, Skeleton } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { Tree } from 'antd';

import type { SkillFileNode } from '@domain/entities';

export interface SkillFileTreeProps {
  nodes: SkillFileNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  onRetry: () => void;
}

interface TreeEntry {
  node: DataNode;
  children: Map<string, TreeEntry>;
}

/**
 * Nests the flat, sorted `SkillFileNode[]` the API returns into Ant Design `Tree`'s
 * `treeData` shape, grouping by `/`-separated directory segments in `relativePath`.
 */
function buildTreeData(nodes: SkillFileNode[]): DataNode[] {
  const root = new Map<string, TreeEntry>();
  const sorted = [...nodes].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const file of sorted) {
    const segments = file.relativePath.split('/').filter(Boolean);
    let currentMap = root;
    let currentPath = '';

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLastSegment = index === segments.length - 1;
      let entry = currentMap.get(segment);
      if (!entry) {
        entry = {
          node: { key: currentPath, title: segment, isLeaf: isLastSegment && !file.isDirectory },
          children: new Map(),
        };
        currentMap.set(segment, entry);
      }
      currentMap = entry.children;
    });
  }

  const toDataNodes = (map: Map<string, TreeEntry>): DataNode[] =>
    Array.from(map.values()).map(({ node, children }) => {
      const childNodes = toDataNodes(children);
      return childNodes.length > 0 ? { ...node, children: childNodes, isLeaf: false } : node;
    });

  return toDataNodes(root);
}

export function SkillFileTree({ nodes, selectedPath, onSelect, isLoading, isError, error, onRetry }: SkillFileTreeProps) {
  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        title="Couldn't load the file tree"
        description={error}
        action={
          <Button size="small" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    );
  }

  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }

  const treeData = buildTreeData(nodes);

  return (
    <Tree
      treeData={treeData}
      selectedKeys={[selectedPath]}
      defaultExpandAll
      onSelect={(_, info) => {
        if (info.node.isLeaf) {
          onSelect(String(info.node.key));
        }
      }}
    />
  );
}
