"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type FilmOption = { id: string; title: string; director: string; year: number | null };

type PresetRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  config: unknown;
  isArchived: boolean;
  isSystem?: boolean;
  shareWithCommunity?: boolean;
  contributorLabel?: string | null;
  validatedF1?: number | null;
};

type HumanVerifiedCutsRevision = {
  id: string;
  filmId: string;
  windowStartSec: number | null;
  windowEndSec: number | null;
  payload: unknown;
  replacesRevisionId: string | null;
  createdAt: string | null;
};

type InsightsPayload = {
  summary: string;
  whatTheMetricsMean: string;
  suggestedAutomations: Array<{
    title: string;
    plainEnglish: string;
    knobHint: string;
  }>;
};

const STEP_LABELS = [
  "Scope & gold",
  "Predict cuts",
  "Score & save",
  "Community insights",
  "Publish & ingest",
] as const;

export function CommunityPrepWizard({ films }: { films: FilmOption[] }) {
  const [step, setStep] = useState(0);
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [filmId, setFilmId] = useState(films[0]?.id ?? "");
  const [revisions, setRevisions] = useState<HumanVerifiedCutsRevision[]>([]);
  const [goldRevisionId, setGoldRevisionId] = useState("");
  const [presetId, setPresetId] = useState("");
  const [workerBase, setWorkerBase] = useState("");
  const [videoPath, setVideoPath] = useState("");
  const [predCuts, setPredCuts] = useState<number[]>([]);
  const [boundaryLabel, setBoundaryLabel] = useState("");
  const [tolerance, setTolerance] = useState(0.5);
  const [lastEval, setLastEval] = useState<{
    run?: { id: string; metrics: Record<string, unknown> };
    eval?: { unmatchedGoldSec: number[]; unmatchedPredSec: number[] };
  } | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [publishName, setPublishName] = useState("");
  const [contributorLabel, setContributorLabel] = useState("");
  const [shareWithCommunity, setShareWithCommunity] = useState(true);
  const [publishedPresetId, setPublishedPresetId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function goToStep(next: number) {
    setStatus(null);
    if (next === 1 && (!goldRevisionId || !presetId)) {
      setStatus("Select a human verified revision and baseline preset first.");
      return;
    }
    if (next === 2 && !predCuts.length) {
      setStatus("Run boundary detect on the predict step first.");
      return;
    }
    if (next === 3 && !lastEval) {
      setStatus("Save the eval run on the score step first.");
      return;
    }
    setStep(next);
  }

  const loadPresets = useCallback(async () => {
    const res = await fetch("/api/boundary-presets?forIngest=1");
    const data = (await res.json()) as { presets?: PresetRow[] };
    const list = data.presets ?? [];
    setPresets(list);
    setPresetId((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id ?? ""));
  }, []);

  const loadRevisions = useCallback(async () => {
    if (!filmId) return;
    const res = await fetch(`/api/eval-gold-revisions?filmId=${encodeURIComponent(filmId)}`);
    const data = (await res.json()) as { revisions?: HumanVerifiedCutsRevision[] };
    const list = data.revisions ?? [];
    setRevisions(list);
    setGoldRevisionId((prev) =>
      prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? "",
    );
  }, [filmId]);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  useEffect(() => {
    void loadRevisions();
  }, [loadRevisions]);

  useEffect(() => {
    const w =
      typeof window !== "undefined"
        ? process.env.NEXT_PUBLIC_WORKER_URL?.replace(/\/$/, "") ?? ""
        : "";
    setWorkerBase(w);
  }, []);

  const selectedFilm = useMemo(
    () => films.find((f) => f.id === filmId),
    [films, filmId],
  );

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === presetId),
    [presets, presetId],
  );

  const presetConfigSummary = useMemo(() => {
    if (!selectedPreset?.config) return "";
    try {
      return JSON.stringify(selectedPreset.config, null, 2);
    } catch {
      return String(selectedPreset.config);
    }
  }, [selectedPreset]);

  async function runBoundaryDetect() {
    const base = workerBase.trim();
    if (!base) {
      setStatus("Set NEXT_PUBLIC_WORKER_URL so the browser can call your TS worker.");
      return;
    }
    if (!videoPath.trim()) {
      setStatus("Enter videoPath (local path on the worker host, same as tuning workspace).");
      return;
    }
    if (!presetId) {
      setStatus("Select a baseline boundary preset to evaluate.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`${base}/api/boundary-detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoPath: videoPath.trim(),
          presetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setPredCuts(Array.isArray(data.cutsSec) ? data.cutsSec : []);
      setBoundaryLabel(String(data.boundaryLabel ?? ""));
      setStatus(
        `Detected ${(data.cutsSec as number[])?.length ?? 0} interior cuts — compare to your human verified set in the next step.`,
      );
      setStep(2);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Detect failed");
    } finally {
      setBusy(false);
    }
  }

  async function runEval() {
    if (!goldRevisionId || !predCuts.length) {
      setStatus("Select a human verified revision and run predict first.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/boundary-eval-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goldRevisionId,
          presetId: presetId || null,
          predictedCutsSec: predCuts,
          toleranceSec: tolerance,
          boundaryLabel: boundaryLabel || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setLastEval({
        run: data.run as { id: string; metrics: Record<string, unknown> },
        eval: data.eval as { unmatchedGoldSec: number[]; unmatchedPredSec: number[] },
      });
      setInsights(null);
      setInsightsError(null);
      setStatus("Eval saved — open insights for a plain-language readout.");
      setStep(3);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Eval failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadInsights() {
    if (!lastEval?.run?.metrics) {
      setStatus("Run an eval first.");
      return;
    }
    setBusy(true);
    setInsightsError(null);
    try {
      const res = await fetch("/api/boundary-eval-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmTitle: selectedFilm?.title ?? "",
          presetName: selectedPreset?.name ?? "",
          toleranceSec: tolerance,
          metrics: lastEval.run.metrics,
          unmatchedGoldSec: lastEval.eval?.unmatchedGoldSec ?? [],
          unmatchedPredSec: lastEval.eval?.unmatchedPredSec ?? [],
          presetConfigSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setInsights(data.insights as InsightsPayload);
      setStep(3);
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : "Insights failed");
    } finally {
      setBusy(false);
    }
  }

  async function publishPreset() {
    if (!presetId) {
      setStatus("Select a source preset to duplicate.");
      return;
    }
    const name = publishName.trim();
    if (!name) {
      setStatus("Enter a name for the community preset.");
      return;
    }
    if (!lastEval?.run?.id) {
      setStatus("Save an eval run before publishing (provenance link).");
      return;
    }
    const metrics = lastEval.run.metrics as Record<string, unknown> | undefined;
    const f1raw = metrics?.f1;
    const validatedF1 =
      typeof f1raw === "number" && Number.isFinite(f1raw)
        ? f1raw
        : Number(f1raw);

    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/boundary-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duplicateFromId: presetId,
          name,
          description: shareWithCommunity
            ? "Community contribution via prep flow — config copied from baseline; adjust in tuning workspace if needed."
            : "Private duplicate from prep flow.",
          contributorLabel: contributorLabel.trim() || null,
          shareWithCommunity,
          sourceEvalRunId: lastEval.run.id,
          validatedF1: Number.isFinite(validatedF1) ? validatedF1 : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      const pid = (data.preset as { id?: string })?.id;
      if (pid) setPublishedPresetId(pid);
      setStatus(
        shareWithCommunity
          ? "Published — everyone can select this boundary profile on ingest."
          : "Saved as a private duplicate (not listed in the public ingest picker).",
      );
      await loadPresets();
      setStep(4);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  if (!films.length) {
    return (
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-6 text-sm text-[var(--color-text-secondary)]">
        No films in the database yet. Ingest a film first, then add human verified cuts in{" "}
        <Link href="/eval/gold-annotate" className="text-[var(--color-text-accent)] underline">
          gold annotate
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <nav
        aria-label="Prep steps"
        className="flex flex-wrap gap-2 border-b border-[var(--color-border-subtle)] pb-4"
      >
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => goToStep(i)}
            className={`rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] transition-colors ${
              step === i
                ? "bg-[var(--color-interactive-default)] text-[var(--color-text-primary)]"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </nav>

      {status ? (
        <p className="font-mono text-sm text-[var(--color-text-accent)]">{status}</p>
      ) : null}

      {step === 0 ? (
        <section className="space-y-6 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Community boundary prep
            </h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">
              Strong human verified cuts are the reference. When you publish a tuned boundary preset after a fair eval,
              it is stored in the shared library so <strong>everyone</strong> can pick it at ingest time — like choosing
              a model profile, not a private fork.
            </p>
          </div>
          <label className="block text-sm text-[var(--color-text-secondary)]">
            Film
            <select
              value={filmId}
              onChange={(e) => {
                setFilmId(e.target.value);
                setGoldRevisionId("");
              }}
              className="mt-1 block w-full max-w-lg rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-[var(--color-text-primary)]"
            >
              {films.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title} ({f.director}
                  {f.year != null ? `, ${f.year}` : ""})
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">Human verified cuts revision</p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Create or refine cuts in{" "}
              <Link href="/eval/gold-annotate" className="text-[var(--color-text-accent)] underline">
                /eval/gold-annotate
              </Link>
              . Use the <strong>same time window</strong> you will evaluate against on the worker.
            </p>
            <ul className="mt-3 space-y-2 font-mono text-xs text-[var(--color-text-secondary)]">
              {revisions.map((r) => (
                <li key={r.id}>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="goldRev"
                      checked={goldRevisionId === r.id}
                      onChange={() => setGoldRevisionId(r.id)}
                    />
                    {r.id.slice(0, 8)}… window {r.windowStartSec ?? "∅"}–{r.windowEndSec ?? "∅"}
                  </label>
                </li>
              ))}
            </ul>
            {!revisions.length ? (
              <p className="mt-2 text-sm text-[var(--color-status-error)]">
                No revisions for this film — add human verified cuts first.
              </p>
            ) : null}
          </div>
          <label className="block text-sm text-[var(--color-text-secondary)]">
            Baseline preset to score against
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="mt-1 block w-full max-w-lg rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-[var(--color-text-primary)]"
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isSystem ? " (system)" : ""}
                  {p.validatedF1 != null ? ` — F1 ${p.validatedF1.toFixed(3)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!goldRevisionId || !presetId || busy}
            onClick={() => goToStep(1)}
            className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-primary)]"
            style={{ backgroundColor: "var(--color-interactive-default)" }}
          >
            Continue to predict
          </button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Predict on the worker</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Boundary detection runs on the TS worker with local <code className="font-mono text-xs">videoPath</code> —
            same as the{" "}
            <Link href="/tuning/workspace" className="text-[var(--color-text-accent)] underline">
              tuning workspace
            </Link>
            .
          </p>
          <label className="block text-sm text-[var(--color-text-secondary)]">
            Worker base (read-only)
            <input
              readOnly
              value={workerBase || "(set NEXT_PUBLIC_WORKER_URL)"}
              className="mt-1 block w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 font-mono text-xs text-[var(--color-text-tertiary)]"
            />
          </label>
          <label className="block text-sm text-[var(--color-text-secondary)]">
            videoPath on worker host
            <input
              value={videoPath}
              onChange={(e) => setVideoPath(e.target.value)}
              placeholder="/data/films/ran/source.mp4"
              className="mt-1 block w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 font-mono text-sm text-[var(--color-text-primary)]"
            />
          </label>
          <label className="block text-sm text-[var(--color-text-secondary)]">
            Match tolerance (seconds)
            <input
              type="number"
              step={0.05}
              min={0}
              value={tolerance}
              onChange={(e) => setTolerance(Number(e.target.value))}
              className="mt-1 block w-32 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-[var(--color-text-primary)]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runBoundaryDetect()}
              className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-primary)]"
              style={{ backgroundColor: "var(--color-interactive-default)" }}
            >
              Run boundary detect
            </button>
            <button
              type="button"
              onClick={() => setStep(0)}
              className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm text-[var(--color-text-secondary)]"
            >
              Back
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Save eval run</h2>
          <p className="font-mono text-xs text-[var(--color-text-tertiary)]">
            {predCuts.length} predicted interior cuts loaded.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runEval()}
              className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-primary)]"
              style={{ backgroundColor: "var(--color-interactive-default)" }}
            >
              Score vs human verified &amp; save
            </button>
            <button type="button" onClick={() => setStep(1)} className="rounded-lg border px-4 py-2 text-sm">
              Back
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-6 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Insights &amp; next automations</h2>
          {lastEval?.run?.metrics ? (
            <pre className="max-h-40 overflow-auto rounded-lg bg-[var(--color-surface-primary)] p-3 font-mono text-[11px] text-[var(--color-text-secondary)]">
              {JSON.stringify(lastEval.run.metrics, null, 2)}
            </pre>
          ) : null}
          <button
            type="button"
            disabled={busy || !lastEval}
            onClick={() => void loadInsights()}
            className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-primary)]"
            style={{ backgroundColor: "var(--color-interactive-default)" }}
          >
            Explain with LLM (Gemini)
          </button>
          {insightsError ? (
            <p className="text-sm text-[var(--color-status-error)]">{insightsError}</p>
          ) : null}
          {insights ? (
            <div className="space-y-4 text-sm leading-7 text-[var(--color-text-secondary)]">
              <p className="text-[var(--color-text-primary)]">{insights.summary}</p>
              <div>
                <p className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
                  What the metrics mean
                </p>
                <p className="mt-1">{insights.whatTheMetricsMean}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase text-[var(--color-text-tertiary)]">
                  Automations you can try
                </p>
                <ul className="mt-2 list-disc space-y-3 pl-5">
                  {insights.suggestedAutomations.map((a) => (
                    <li key={a.title}>
                      <span className="font-medium text-[var(--color-text-primary)]">{a.title}</span>
                      <span className="block">{a.plainEnglish}</span>
                      <span className="mt-1 block font-mono text-xs text-[var(--color-text-accent)]">
                        {a.knobHint}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Apply knob changes in{" "}
                <Link href="/tuning/workspace" className="underline">
                  tuning workspace
                </Link>{" "}
                (duplicate preset, edit JSON), then re-run this prep flow — or publish the baseline as a named community
                profile if it is already good enough.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-border-subtle)] pt-4">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-primary)]"
              style={{ backgroundColor: "var(--color-interactive-default)" }}
            >
              Continue to publish / skip
            </button>
            <button type="button" onClick={() => setStep(2)} className="rounded-lg border px-4 py-2 text-sm">
              Back
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="space-y-6 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Publish or go straight to ingest</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Publishing <strong>duplicates</strong> the baseline preset configuration, attaches your eval run as provenance,
            and (by default) lists it for <strong>all users</strong> in the ingest model picker. To change knobs, edit the
            new row in the tuning workspace after publish.
          </p>
          <label className="block text-sm text-[var(--color-text-secondary)]">
            New preset name
            <input
              value={publishName}
              onChange={(e) => setPublishName(e.target.value)}
              placeholder="e.g. Ran — tighter merge (community)"
              className="mt-1 block w-full max-w-lg rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-[var(--color-text-primary)]"
            />
          </label>
          <label className="block text-sm text-[var(--color-text-secondary)]">
            Contributor label (optional)
            <input
              value={contributorLabel}
              onChange={(e) => setContributorLabel(e.target.value)}
              placeholder="Display name or team"
              className="mt-1 block w-full max-w-lg rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-[var(--color-text-primary)]"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={shareWithCommunity}
              onChange={(e) => setShareWithCommunity(e.target.checked)}
            />
            Share with community (recommended — everyone can select this on ingest)
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !lastEval?.run?.id}
              onClick={() => void publishPreset()}
              className="rounded-lg px-4 py-2 text-sm text-[var(--color-text-primary)]"
              style={{ backgroundColor: "var(--color-interactive-default)" }}
            >
              Publish duplicate
            </button>
            <Link
              href="/ingest"
              className="inline-flex items-center rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm text-[var(--color-text-secondary)]"
            >
              Skip — ingest with Auto
            </Link>
          </div>
          {publishedPresetId ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              <Link
                href={`/ingest?boundaryPreset=${encodeURIComponent(publishedPresetId)}`}
                className="font-medium text-[var(--color-text-accent)] underline"
              >
                Open ingest with this preset selected →
              </Link>
            </p>
          ) : null}
          <button type="button" onClick={() => setStep(3)} className="text-xs text-[var(--color-text-tertiary)] underline">
            Back
          </button>
        </section>
      ) : null}

      <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
        Advanced operators: full preset JSON and film assignment live in{" "}
        <Link href="/tuning/workspace" className="underline">
          /tuning/workspace
        </Link>
        .
      </p>
    </div>
  );
}
