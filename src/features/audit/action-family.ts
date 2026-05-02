/**
 * Shared action-family utilities — reused by AuditTimeline and AuditForCredential.
 */

/** Action family — derived from the action string prefix for color-coding. */
export type ActionFamily = "create" | "update" | "delete" | "reveal" | "lock" | "feed" | "default";

/** Derive a color family from an action string. */
export function actionFamily(action: string): ActionFamily {
  if (action.endsWith(".create")) return "create";
  if (action.endsWith(".update") || action.endsWith(".edit")) return "update";
  if (action.endsWith(".delete") || action.endsWith(".revoke")) return "delete";
  if (action.includes(".reveal") || action.includes(".read")) return "reveal";
  if (action.includes(".lock") || action.includes(".unlock")) return "lock";
  if (action.startsWith("feed_")) return "feed";
  return "default";
}

/** Tailwind class string for each action family badge. */
export const ACTION_FAMILY_CLASS: Record<ActionFamily, string> = {
  create: "bg-green-500/15 text-green-700 dark:text-green-300",
  update: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  delete: "bg-red-500/15 text-red-700 dark:text-red-300",
  reveal: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  lock: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  feed: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  default: "bg-muted text-muted-foreground",
};
