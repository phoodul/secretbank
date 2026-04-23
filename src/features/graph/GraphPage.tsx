import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { DependencyGraph } from './DependencyGraph';
import { MobileGraphList } from './MobileGraphList';
import { useGraphData } from './use-graph-data';
import { useGraphNodesDraggable } from './use-graph-nodes-draggable';
import { useIsMobile } from './use-is-mobile';

export function GraphPage() {
  const { t } = useTranslation('common');
  const { state, refresh } = useGraphData();
  const [draggable] = useGraphNodesDraggable();
  const platform = useIsMobile();

  if (state.phase === 'loading') {
    return (
      <div className="p-6 text-sm text-muted-foreground">{t('graph.loading')}</div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">
          {t('graph.error')}: {state.message}
        </p>
        <Button variant="outline" size="sm" onClick={refresh} className="mt-3">
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  // Empty state — no credentials wired to any project yet
  if (state.data.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b px-4 py-3">
          <h1 className="text-xl font-semibold">{t('graph.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('graph.subtitle')}</p>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">{t('graph.empty')}</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">{t('nav.inventory')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Mobile branch — hierarchical list view
  if (platform === 'mobile') {
    return (
      <div className="flex h-full flex-col" data-testid="mobile-graph-page">
        <header className="border-b px-4 py-3">
          <h1 className="text-xl font-semibold">{t('graph.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('graph.mobile.subtitle')}</p>
        </header>
        <div className="flex-1 overflow-auto">
          <MobileGraphList payload={state.data} />
        </div>
      </div>
    );
  }

  // Desktop branch — interactive React Flow graph
  return (
    <div className="flex h-full flex-col" data-testid="desktop-graph-page">
      <header className="border-b px-4 py-3">
        <h1 className="text-xl font-semibold">{t('graph.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('graph.subtitle')}</p>
      </header>
      <div className="flex-1" style={{ minHeight: 0 }}>
        <DependencyGraph payload={state.data} nodesDraggable={draggable} />
      </div>
    </div>
  );
}
