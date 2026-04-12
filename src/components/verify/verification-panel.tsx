"use client";

import { startTransition, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, LoaderCircle, Star } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  VERIFIABLE_FIELDS,
  getClassificationSourceLabel,
  getVerificationFieldDisplayValue,
} from "@/lib/verification";
import type { ShotWithDetails, VerificationFieldKey } from "@/lib/types";

type VerificationPanelProps = {
  shot: ShotWithDetails;
};

function getSignalColor(rating: number) {
  if (rating >= 4) {
    return "var(--color-signal-green)";
  }

  if (rating >= 2) {
    return "var(--color-signal-amber)";
  }

  return "var(--color-signal-red)";
}

function getSourceBadgeColor(source: string) {
  if (source === "Gemini") {
    return "var(--color-accent-base)";
  }

  if (source === "RAFT") {
    return "var(--color-signal-violet)";
  }

  return "var(--color-overlay-badge)";
}

export function VerificationPanel({ shot }: VerificationPanelProps) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [fieldRatings, setFieldRatings] = useState<
    Partial<Record<VerificationFieldKey, number>>
  >({});
  const [corrections, setCorrections] = useState<
    Partial<Record<VerificationFieldKey, string>>
  >({});
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const sourceLabel = getClassificationSourceLabel(
    shot.metadata.classificationSource,
  );
  const sourceBadgeColor = getSourceBadgeColor(sourceLabel);
  const hasRatedEveryField = VERIFIABLE_FIELDS.every(
    ({ key }) => typeof fieldRatings[key] === "number",
  );
  const canSubmit = overallRating !== null && hasRatedEveryField;
  const isBusy = isSubmitting || isRefreshing;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || overallRating === null) {
      setErrorMessage("Rate the shot and each metadata field before submitting.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const activeCorrections = Object.fromEntries(
        Object.entries(corrections).filter(([field, value]) => {
          const rating = fieldRatings[field as VerificationFieldKey];

          return typeof rating === "number" && rating < 3 && Boolean(value);
        }),
      );

      const response = await fetch("/api/verifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shotId: shot.id,
          overallRating,
          fieldRatings,
          corrections: activeCorrections,
          notes,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        throw new Error(body?.error ?? "Failed to submit verification.");
      }

      setOverallRating(null);
      setFieldRatings({});
      setCorrections({});
      setNotes("");
      setSuccessMessage("Verification saved. History has been refreshed.");
      startTransition(() => {
        startRefresh(() => {
          router.refresh();
        });
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to submit verification.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className="rounded-[var(--radius-xl)] border p-6 shadow-[var(--shadow-lg)]"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 84%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Review console
          </p>
          <h2
            className="mt-3 text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Verify AI metadata
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-text-secondary)]">
            Score the shot holistically, inspect each taxonomy field, and provide corrections where the current classification falls below acceptable accuracy.
          </p>
        </div>

        <span
          className="rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)]"
          style={{
            color: sourceBadgeColor,
            borderColor: `color-mix(in oklch, ${sourceBadgeColor} 42%, transparent)`,
            backgroundColor: `color-mix(in oklch, ${sourceBadgeColor} 12%, transparent)`,
          }}
        >
          {sourceLabel}
        </span>
      </div>

      <form id="verification-ratings" className="mt-8 scroll-mt-24 space-y-6" onSubmit={handleSubmit}>
        <div
          className="rounded-[var(--radius-lg)] border p-5"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Overall rating
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">
                Rate the end-to-end quality of the AI classification from 0 to 5.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-full border px-3 py-2 font-mono text-xs transition-colors"
                style={{
                  color:
                    overallRating === 0
                      ? "var(--color-text-primary)"
                      : "var(--color-text-secondary)",
                  borderColor:
                    overallRating === 0
                      ? "color-mix(in oklch, var(--color-signal-red) 42%, transparent)"
                      : "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                  backgroundColor:
                    overallRating === 0
                      ? "color-mix(in oklch, var(--color-signal-red) 12%, transparent)"
                      : "color-mix(in oklch, var(--color-surface-secondary) 68%, transparent)",
                }}
                onClick={() => setOverallRating(0)}
              >
                0
              </button>
              {[1, 2, 3, 4, 5].map((rating) => {
                const active = overallRating !== null && overallRating >= rating;
                const color = getSignalColor(rating);

                return (
                  <button
                    key={rating}
                    type="button"
                    aria-label={`Set overall rating to ${rating}`}
                    className="rounded-full border p-2 transition-transform hover:-translate-y-0.5"
                    style={{
                      color: active ? color : "var(--color-text-tertiary)",
                      borderColor: active
                        ? `color-mix(in oklch, ${color} 42%, transparent)`
                        : "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                      backgroundColor: active
                        ? `color-mix(in oklch, ${color} 12%, transparent)`
                        : "color-mix(in oklch, var(--color-surface-secondary) 68%, transparent)",
                    }}
                    onClick={() => setOverallRating(rating)}
                  >
                    <Star
                      className="size-4"
                      fill={active ? "currentColor" : "none"}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {VERIFIABLE_FIELDS.map((field) => {
            const rating = fieldRatings[field.key];
            const currentValue = getVerificationFieldDisplayValue(shot, field.key);
            const signalColor =
              typeof rating === "number"
                ? getSignalColor(rating)
                : "var(--color-border-default)";

            return (
              <div
                key={field.key}
                className="rounded-[var(--radius-lg)] border p-5"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
                  borderColor: `color-mix(in oklch, ${signalColor} 28%, transparent)`,
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                      {field.label}
                    </p>
                    <span
                      className="mt-3 inline-flex rounded-full border px-3 py-1 font-mono text-xs"
                      style={{
                        color: "var(--color-text-primary)",
                        borderColor:
                          "color-mix(in oklch, var(--color-overlay-arrow) 40%, transparent)",
                        backgroundColor:
                          "color-mix(in oklch, var(--color-overlay-arrow) 12%, transparent)",
                      }}
                    >
                      {currentValue}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 2, 3, 4, 5].map((value) => {
                      const active = rating === value;
                      const color = getSignalColor(value);

                      return (
                        <button
                          key={value}
                          type="button"
                          className="min-w-10 rounded-full border px-3 py-2 font-mono text-xs transition-transform hover:-translate-y-0.5"
                          style={{
                            color: active
                              ? "var(--color-text-primary)"
                              : "var(--color-text-secondary)",
                            borderColor: active
                              ? `color-mix(in oklch, ${color} 46%, transparent)`
                              : "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                            backgroundColor: active
                              ? `color-mix(in oklch, ${color} 14%, transparent)`
                              : "color-mix(in oklch, var(--color-surface-secondary) 70%, transparent)",
                          }}
                          onClick={() => {
                            setFieldRatings((current) => ({
                              ...current,
                              [field.key]: value,
                            }));

                            if (value >= 3) {
                              setCorrections((current) => {
                                const next = { ...current };
                                delete next[field.key];
                                return next;
                              });
                            }
                          }}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {typeof rating === "number" && rating < 3 ? (
                  <div className="mt-4">
                    <label
                      htmlFor={`correction-${field.key}`}
                      className="font-mono text-[11px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]"
                    >
                      Suggested correction
                    </label>
                    <select
                      id={`correction-${field.key}`}
                      value={corrections[field.key] ?? ""}
                      className="mt-2 h-11 w-full rounded-[var(--radius-md)] border px-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors"
                      style={{
                        fontFamily: "var(--font-mono)",
                        backgroundColor:
                          "color-mix(in oklch, var(--color-surface-secondary) 72%, transparent)",
                        borderColor:
                          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                      }}
                      onChange={(event) =>
                        setCorrections((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select corrected value</option>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div
          className="rounded-[var(--radius-lg)] border p-5"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
          }}
        >
          <label
            htmlFor="verification-notes"
            className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]"
          >
            Reviewer notes
          </label>
          <textarea
            id="verification-notes"
            value={notes}
            rows={5}
            placeholder="Optional context: uncertainty, edge cases, framing cues, or why a correction was needed."
            className="mt-3 w-full rounded-[var(--radius-md)] border px-3 py-3 text-sm leading-7 text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-tertiary)]"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-secondary) 72%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
            }}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-[var(--color-text-secondary)]">
            {canSubmit
              ? "Ready to commit this review pass."
              : "Complete the overall score and every field-level rating to enable submission."}
          </div>

          <Button
            type="submit"
            disabled={!canSubmit || isBusy}
            className="rounded-full px-5 text-[var(--color-surface-primary)]"
            style={{
              backgroundColor: "var(--color-accent-light)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            {isBusy ? (
              <>
                <LoaderCircle className="animate-spin" />
                Saving review
              </>
            ) : (
              "Submit verification"
            )}
          </Button>
        </div>

        <AnimatePresence mode="wait">
          {errorMessage ? (
            <motion.p
              key={errorMessage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-[var(--radius-md)] border px-4 py-3 text-sm"
              style={{
                color: "var(--color-signal-red)",
                borderColor:
                  "color-mix(in oklch, var(--color-signal-red) 40%, transparent)",
                backgroundColor:
                  "color-mix(in oklch, var(--color-signal-red) 10%, transparent)",
              }}
            >
              {errorMessage}
            </motion.p>
          ) : null}

          {!errorMessage && successMessage ? (
            <motion.div
              key={successMessage}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm"
              style={{
                color: "var(--color-status-verified)",
                borderColor:
                  "color-mix(in oklch, var(--color-status-verified) 36%, transparent)",
                backgroundColor:
                  "color-mix(in oklch, var(--color-status-verified) 10%, transparent)",
              }}
            >
              <CheckCircle2 className="size-4" />
              <span>{successMessage}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </form>
    </section>
  );
}
