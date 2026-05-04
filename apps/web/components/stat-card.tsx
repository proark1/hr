import * as React from "react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Use the brand gradient for the primary card. */
  variant?: "primary" | "default";
};

/**
 * Headline stat tile. The "primary" variant uses the cream/navy/blue brand
 * gradient defined in app/globals.css to match the screenshot reference.
 */
export function StatCard({ label, value, hint, variant = "default" }: StatCardProps) {
  const isPrimary = variant === "primary";
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border p-6 shadow-sm",
        isPrimary
          ? "border-transparent text-white bg-[linear-gradient(135deg,var(--color-brand-gradient-from),var(--color-brand-gradient-to))]"
          : "border-border bg-card text-card-foreground",
      )}
    >
      <div
        className={cn(
          "text-xs font-medium uppercase tracking-wider",
          isPrimary ? "text-white/80" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {hint ? (
        <div
          className={cn(
            "mt-1 text-sm",
            isPrimary ? "text-white/80" : "text-muted-foreground",
          )}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
