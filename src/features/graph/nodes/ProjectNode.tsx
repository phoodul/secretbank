import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { FolderGit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import type { GraphNodeData } from '../adapter';

function ProjectNodeInner({ data }: NodeProps<Node<GraphNodeData>>) {
  const { t } = useTranslation('common');
  const isLR = data.direction === 'LR';
  const targetPos = isLR ? Position.Left : Position.Top;
  const sourcePos = isLR ? Position.Right : Position.Bottom;

  return (
    <>
      <Handle
        type="target"
        position={targetPos}
        className="!h-2 !w-2 !bg-muted-foreground/50"
      />
      <Card
        className={cn(
          'min-w-[160px] max-w-[220px] border-2 px-3 py-2 shadow-sm',
          'bg-vault-success/10 border-vault-success/30',
        )}
      >
        <div className="flex items-center gap-2">
          <FolderGit2 className="size-4 shrink-0 text-vault-success" aria-hidden />
          <span className="truncate text-xs font-medium uppercase tracking-wide text-vault-success opacity-70">
            {t('graph.kind.project')}
          </span>
        </div>
        <div className="mt-1 truncate text-sm font-semibold text-foreground">{data.label}</div>
      </Card>
      <Handle
        type="source"
        position={sourcePos}
        className="!h-2 !w-2 !bg-muted-foreground/50"
      />
    </>
  );
}

export const ProjectNode = memo(ProjectNodeInner);
