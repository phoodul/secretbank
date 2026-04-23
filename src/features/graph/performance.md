# Graph Performance Notes

## Memoization — `areNodePropsEqual` (nodes/shared.ts)

Compared fields: `id`, `label`, `kind`, `direction`, `status`, `compact`.
Ignored: `meta` (not rendered), `selected` / `dragging` / `zIndex` / `positionAbsolute*` (React Flow internal).
All 4 node components (`IssuerNode`, `CredentialNode`, `ProjectNode`, `DeploymentNode`) use this comparator.

## Viewport Culling

`onlyRenderVisibleElements` prop on `<ReactFlow>` — built-in React Flow optimization.
Nodes outside the current viewport are not mounted in the DOM.

## Compact Mode

Threshold: `nodes.length > 200 AND zoom < 0.5`.
Effect: node labels hidden; icon + type badge remain for structure visibility.
Implementation: `useViewport()` in `InnerGraph` → `compactMode` bool → injected as `data.compact = true` in `computedNodes` useMemo.

## nodesDraggable

Default: `false` (best performance — no drag event listeners).
Preference stored: `localStorage['apivault:graph:nodesDraggable']`.
Hook: `useGraphNodesDraggable()` in `use-graph-nodes-draggable.ts`.
Toggle UI: Settings page → Graph section.

## Known Follow-ups

- Zustand selector granularity: React Flow v12 already uses Zustand internally. Verify fine-grained selectors before adding an external store layer.
- Edge memoization: currently default React Flow behavior. If edge count > 500 causes jank, consider `React.memo` on custom edge components.
- 500-node manual FPS measurement: deferred (requires `pnpm tauri dev` + seed script).
