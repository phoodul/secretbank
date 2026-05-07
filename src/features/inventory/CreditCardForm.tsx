/**
 * CreditCardForm — Phase 3-A-4
 *
 * 신용/체크카드 등록·편집 폼.
 *
 * 보안 규칙 (GATE 2-4 / THREAT_MODEL §4):
 *   - 카드번호 평문 console.log 절대 금지.
 *   - cvcRevealed 는 항상 false 고정 (폼 뷰는 마스킹 상태).
 *   - PIN 필드 포함 금지 (GATE 2-6 미룸 결정).
 *
 * 스타일 규칙 (F.2-1):
 *   - hex 하드코딩 ❌. oklch() + Tailwind 디자인 토큰만 사용.
 */

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PatternFormat } from "react-number-format";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreditCardVisual } from "@/components/ui/credit-card-visual";
import { type CardBrand, detectBrand } from "@/lib/card-utils";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const currentYear = new Date().getFullYear();

export const creditCardSchema = z
  .object({
    card_number_plain: z
      .string()
      .regex(/^\d+$/, "Numbers only")
      .min(13, "Card number too short")
      .max(19, "Card number too long"),
    expiry_month: z.number().int().min(1).max(12),
    expiry_year: z.number().int(),
    cvc_plain: z
      .string()
      .regex(/^\d+$/, "Numbers only")
      .min(3, "CVC must be at least 3 digits")
      .max(4, "CVC must be at most 4 digits"),
    cardholder_name: z.string().max(100).optional(),
    billing_address: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      const now = new Date();
      const cm = now.getMonth() + 1;
      const cy = now.getFullYear();
      return data.expiry_year > cy || (data.expiry_year === cy && data.expiry_month >= cm);
    },
    { message: "Expiry date is in the past", path: ["expiry_month"] },
  );

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreditCardFormValues = {
  /** Digits only, normalised (e.g. "4111111111111111") */
  card_number_plain: string;
  /** 1-12 */
  expiry_month: number;
  /** 4-digit year (2025+) */
  expiry_year: number;
  /** 3-4 digits */
  cvc_plain: string;
  cardholder_name?: string;
  billing_address?: string;
};

export interface CreditCardFormProps {
  /**
   * Edit mode = pass existing values.
   * For security, card_number_plain / cvc_plain are intentionally NOT pre-filled
   * (carousel shows last_4 only). Only cardholder_name / billing_address etc. may be pre-filled.
   */
  defaultValues?: Partial<CreditCardFormValues>;
  /** Called on valid submit. brand and last_4 are derived by the form. */
  onSubmit: (values: CreditCardFormValues & { brand: CardBrand; last_4: string }) => Promise<void>;
  onCancel?: () => void;
  /** When true, disables the submit button and shows loading text. */
  submitting?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreditCardForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: CreditCardFormProps) {
  const form = useForm<CreditCardFormValues>({
    resolver: zodResolver(creditCardSchema),
    defaultValues: {
      card_number_plain: "",
      expiry_month: new Date().getMonth() + 1,
      expiry_year: currentYear,
      cvc_plain: "",
      cardholder_name: "",
      billing_address: "",
      ...defaultValues,
    },
  });

  // Reactive watches for real-time preview
  const cardNumber = form.watch("card_number_plain");
  const cardholder = form.watch("cardholder_name");
  const expMonth = form.watch("expiry_month");
  const expYear = form.watch("expiry_year");

  // Real-time BIN detection — uses only first 6 digits internally (B.5-5)
  const brand: CardBrand = detectBrand(cardNumber);

  // Preview last_4: show "0000" until at least 4 digits are entered
  const last4 = cardNumber.length >= 4 ? cardNumber.slice(-4) : "0000";

  async function handleSubmit(data: CreditCardFormValues) {
    await onSubmit({
      ...data,
      brand,
      last_4: data.card_number_plain.slice(-4),
    });
  }

  const years = Array.from({ length: 21 }, (_, i) => currentYear + i);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Real-time card preview — cvcRevealed always false (GATE 2-4) */}
        <CreditCardVisual
          last4={last4}
          brand={brand}
          cardholderName={cardholder || undefined}
          expiryMonth={expMonth}
          expiryYear={expYear}
          cvcRevealed={false}
        />

        {/* Card number */}
        <FormField
          control={form.control}
          name="card_number_plain"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Card number</FormLabel>
              <FormControl>
                <PatternFormat
                  format={brand === "amex" ? "#### ###### #####" : "#### #### #### ####"}
                  customInput={Input}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v.value)}
                  inputMode="numeric"
                  placeholder={brand === "amex" ? "3782 822463 10005" : "4111 1111 1111 1111"}
                  aria-label="Card number"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Expiry month + year — one row */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="expiry_month"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expiry month</FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger aria-label="Expiry month">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {String(m).padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expiry_year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expiry year</FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger aria-label="Expiry year">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* CVC — masked, Amex = 4 digits */}
        <FormField
          control={form.control}
          name="cvc_plain"
          render={({ field }) => (
            <FormItem className="max-w-[140px]">
              <FormLabel>CVC</FormLabel>
              <FormControl>
                <PatternFormat
                  format={brand === "amex" ? "####" : "###"}
                  customInput={Input}
                  type="password"
                  value={field.value}
                  onValueChange={(v) => field.onChange(v.value)}
                  inputMode="numeric"
                  aria-label="CVC"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Cardholder name (optional) */}
        <FormField
          control={form.control}
          name="cardholder_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cardholder name (optional)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="As shown on card" autoComplete="cc-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Billing address (optional, GATE 2-5) */}
        <FormField
          control={form.control}
          name="billing_address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Billing address (optional)</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} placeholder="Billing address" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
