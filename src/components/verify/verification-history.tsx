import {
  VERIFICATION_FIELD_LABELS,
  getCorrectionDisplayValue,
  getFieldRatingsSummary,
} from "@/lib/verification";
import type { VerificationFieldKey, VerificationRecord } from "@/lib/types";

type VerificationHistoryProps = {
  verifications: VerificationRecord[];
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function VerificationHistory({
  verifications,
}: VerificationHistoryProps) {
  return (
    <section
      className="rounded-[var(--radius-xl)] border p-6"
      style={{
        backgroundColor:
          "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Verification history
          </p>
          <h2
            className="mt-3 text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Prior review passes
          </h2>
        </div>
        <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
          {verifications.length} total
        </p>
      </div>

      {verifications.length === 0 ? (
        <div
          className="mt-6 rounded-[var(--radius-lg)] border border-dashed p-5 text-sm leading-7 text-[var(--color-text-secondary)]"
          style={{
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 52%, transparent)",
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 54%, transparent)",
          }}
        >
          No verification records yet. The first review submission becomes the baseline for this shot.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {verifications.map((verification) => {
            const ratings = getFieldRatingsSummary(verification.fieldRatings);
            const corrections = Object.entries(verification.corrections ?? {});

            return (
              <article
                key={verification.id}
                className="rounded-[var(--radius-lg)] border p-4"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 70%, transparent)",
                  borderColor:
                    "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    {verification.verifiedAt
                      ? dateFormatter.format(new Date(verification.verifiedAt))
                      : "Unknown review time"}
                  </p>
                  <span
                    className="rounded-full border px-3 py-1 font-mono text-xs"
                    style={{
                      color: "var(--color-status-verified)",
                      borderColor:
                        "color-mix(in oklch, var(--color-status-verified) 42%, transparent)",
                      backgroundColor:
                        "color-mix(in oklch, var(--color-status-verified) 14%, transparent)",
                    }}
                  >
                    Overall {verification.overallRating ?? "N/A"}/5
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {ratings.map((rating) => (
                    <span
                      key={rating.field}
                      className="rounded-full border px-3 py-1 text-xs"
                      style={{
                        color: "var(--color-text-secondary)",
                        borderColor:
                          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                        backgroundColor:
                          "color-mix(in oklch, var(--color-surface-secondary) 70%, transparent)",
                      }}
                    >
                      {rating.label}:{" "}
                      <span className="font-mono text-[var(--color-text-primary)]">
                        {rating.rating}/5
                      </span>
                    </span>
                  ))}
                </div>

                {corrections.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {corrections.map(([field, value]) => (
                      <span
                        key={field}
                        className="rounded-full border px-3 py-1 text-xs"
                        style={{
                          color: "var(--color-overlay-badge)",
                          borderColor:
                            "color-mix(in oklch, var(--color-overlay-badge) 40%, transparent)",
                          backgroundColor:
                            "color-mix(in oklch, var(--color-overlay-badge) 12%, transparent)",
                        }}
                      >
                        {VERIFICATION_FIELD_LABELS[field as VerificationFieldKey]}:{" "}
                        <span className="font-mono text-[var(--color-text-primary)]">
                          {typeof value === "string"
                            ? getCorrectionDisplayValue(
                                field as VerificationFieldKey,
                                value,
                              )
                            : "N/A"}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}

                {verification.notes ? (
                  <p className="mt-4 text-sm leading-7 text-[var(--color-text-secondary)]">
                    {verification.notes}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
