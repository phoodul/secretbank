import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuditListInput } from "./types";

const SUBJECT_KINDS = [
  "credential",
  "project",
  "deployment",
  "usage",
  "settings",
  "vault_setting",
  "vault",
  "incident",
  "railguard",
] as const;

interface AuditFilterBarProps {
  filter: AuditListInput;
  onChange: (next: AuditListInput) => void;
}

export function AuditFilterBar({ filter, onChange }: AuditFilterBarProps) {
  const { t } = useTranslation("common");

  function handleActionPrefix(value: string) {
    onChange({ ...filter, action_prefix: value || undefined, offset: 0 });
  }

  function handleSubjectKind(value: string) {
    onChange({ ...filter, subject_kind: value === "__any__" ? undefined : value, offset: 0 });
  }

  function handleDeviceId(value: string) {
    onChange({ ...filter, device_id: value || undefined, offset: 0 });
  }

  function handleClear() {
    onChange({ limit: filter.limit });
  }

  const hasFilter =
    filter.action_prefix != null ||
    filter.subject_kind != null ||
    filter.device_id != null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Action prefix */}
      <Input
        className="h-8 w-44 text-xs"
        placeholder={t("audit.filter.actionPlaceholder")}
        value={filter.action_prefix ?? ""}
        onChange={(e) => handleActionPrefix(e.target.value)}
        aria-label={t("audit.filter.action")}
      />

      {/* Subject kind dropdown */}
      <Select
        value={filter.subject_kind ?? "__any__"}
        onValueChange={handleSubjectKind}
      >
        <SelectTrigger className="h-8 w-40 text-xs" aria-label={t("audit.filter.subjectKind")}>
          <SelectValue placeholder={t("audit.filter.subjectKindAny")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__any__">{t("audit.filter.subjectKindAny")}</SelectItem>
          {SUBJECT_KINDS.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {kind}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Device id */}
      <Input
        className="h-8 w-48 font-mono text-xs"
        placeholder={t("audit.filter.deviceIdPlaceholder")}
        value={filter.device_id ?? ""}
        onChange={(e) => handleDeviceId(e.target.value)}
        aria-label={t("audit.filter.deviceId")}
      />

      {/* Clear */}
      {hasFilter && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={handleClear}
        >
          <X className="h-3 w-3" aria-hidden />
          {t("audit.filter.clear")}
        </Button>
      )}
    </div>
  );
}
