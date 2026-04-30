import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  /** 트리거 버튼에 적용할 클래스 — 위치/색상 토널리티 오버라이드용 */
  className?: string;
  /**
   * `"corner"` 변형은 LockScreen 같은 화면의 작은 코너 글래스 버튼 톤.
   * `"plain"` 은 settings 같은 일반 폼 컨텍스트의 표준 dropdown.
   */
  variant?: "corner" | "plain";
}

/**
 * 11개 언어를 dropdown 으로 노출하는 글로벌 LanguageSwitcher.
 * 선택 시 i18next.changeLanguage 를 호출하면 LanguageDetector cache 가 자동 저장된다.
 */
export function LanguageSwitcher({ className, variant = "plain" }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation("common");
  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) ??
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_LANGUAGES[0];

  const isCorner = variant === "corner";
  const label = t("settings.language");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}: ${current.nativeName}`}
        className={cn(
          "inline-flex items-center gap-2 rounded-md text-xs font-medium transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-vault-lapis-bright/60 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
          isCorner
            ? [
                "border px-2.5 py-1.5",
                "border-[oklch(from_var(--vault-lapis-bright)_l_c_h_/_0.22)]",
                "bg-[oklch(from_var(--vault-lapis-deep)_l_c_h_/_0.45)]",
                "text-[oklch(0.92_0.02_240)]",
                "shadow-[inset_0_1px_0_oklch(from_var(--vault-lapis-bright)_l_c_h_/_0.18),0_1px_0_oklch(0_0_0_/_0.4)]",
                "backdrop-blur-md",
                "hover:bg-[oklch(from_var(--vault-lapis-deep)_l_c_h_/_0.6)]",
                "hover:border-[oklch(from_var(--vault-gold)_l_c_h_/_0.45)]",
                "hover:text-[var(--vault-gold-bright)]",
              ]
            : [
                "border border-input bg-background px-3 py-2 text-sm",
                "hover:bg-accent hover:text-accent-foreground",
              ],
          className,
        )}
      >
        <Globe className={isCorner ? "size-3.5" : "size-4"} aria-hidden="true" />
        <span>{current.nativeName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="min-w-[12rem] max-h-[60vh] overflow-y-auto"
      >
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={current.code}
          onValueChange={(value) => {
            void i18n.changeLanguage(value);
          }}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <DropdownMenuRadioItem
              key={lang.code}
              value={lang.code}
              className="font-medium"
              data-testid={`language-option-${lang.code}`}
            >
              <span className="flex flex-col">
                <span>{lang.nativeName}</span>
                {lang.englishName !== lang.nativeName && (
                  <span className="text-[10px] text-muted-foreground">
                    {lang.englishName}
                  </span>
                )}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
