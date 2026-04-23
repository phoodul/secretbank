import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import type { GraphNodeData } from '../adapter';

function IssuerNodeInner({ data }: NodeProps<Node<GraphNodeData>>) {
  const { t } = useTranslation('common');
  const isLR = data.direction === 'LR';
  const sourcePos = isLR ? Position.Right : Position.Bottom;
  const status = data.status;

  return (
    <>
      <Card
        data-status={status}
        className={cn(
          'min-w-[160px] max-w-[220px] border-2 px-3 py-2 shadow-sm transition-all duration-200',
          'bg-vault-info/10 border-vault-info/30',
          status === 'primary' && 'outline outline-[3px] outline-offset-2',
          status === 'secondary' && 'outline outline-2 outline-offset-2',
          status === 'tertiary' && 'outline outline-1 outline-offset-1',
          status === 'dimmed' && 'opacity-35',
        )}
        style={
          status === 'primary'
            ? { outlineColor: 'var(--vault-danger)', outlineStyle: 'solid' }
            : status === 'secondary'
              ? { outlineColor: 'var(--vault-warning)', outlineStyle: 'dashed' }
              : status === 'tertiary'
                ? { outlineColor: 'var(--muted-foreground)', outlineStyle: 'dotted' }
                : undefined
        }
      >
        <div className="flex items-center gap-2">
          <Building2 className="size-4 shrink-0 text-vault-info" aria-hidden />
          <span className="truncate text-xs font-medium uppercase tracking-wide text-vault-info opacity-70">
            {t('graph.kind.issuer')}
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

export const IssuerNode = memo(IssuerNodeInner);
