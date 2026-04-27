/**
 * Re-export of SyncProvider hooks for the conventional `use-*` import path.
 *
 * The actual implementation lives next to the provider so the file boundary
 * matches the React context (single source of truth). Components that just
 * need the hook can `import { useSync } from "@/features/sync/use-sync"`.
 */
export { useSync, useYMap } from "./SyncProvider";
export type { SyncContextValue, SyncStatus } from "./SyncProvider";
