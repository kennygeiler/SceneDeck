import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify",
  description: "Verification workflow placeholder for SceneDeck.",
};

export default function VerifyPage() {
  return (
    <section className="flex min-h-[60vh] items-center">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Placeholder route
        </p>
        <h1
          className="mt-4 text-4xl font-bold tracking-[var(--letter-spacing-tight)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Verify
        </h1>
        <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
          Verification tooling for movement labels and metadata confidence will
          be added in a later milestone.
        </p>
      </div>
    </section>
  );
}
