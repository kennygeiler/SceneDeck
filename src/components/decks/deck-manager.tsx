"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download, Plus, Trash2 } from "lucide-react";

import {
  type ReferenceDeck,
  createDeck,
  deleteDeck,
  exportDeckAsCsv,
  exportDeckAsJson,
  getDecks,
  removeShotFromDeck,
} from "@/lib/reference-deck";
import {
  getFramingDisplayName,
  getShotSizeDisplayName,
} from "@/lib/shot-display";
import type { FramingSlug, ShotSizeSlug } from "@/lib/taxonomy";

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DeckManager() {
  const [decks, setDecks] = useState<ReferenceDeck[]>([]);
  const [newDeckName, setNewDeckName] = useState("");

  const refresh = useCallback(() => setDecks(getDecks()), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleCreate() {
    if (!newDeckName.trim()) return;
    createDeck(newDeckName.trim());
    setNewDeckName("");
    refresh();
  }

  function handleDelete(deckId: string) {
    deleteDeck(deckId);
    refresh();
  }

  function handleRemoveShot(deckId: string, shotId: string) {
    removeShotFromDeck(deckId, shotId);
    refresh();
  }

  function handleExportJson(deck: ReferenceDeck) {
    const content = exportDeckAsJson(deck);
    downloadFile(content, `${deck.name}.json`, "application/json");
  }

  function handleExportCsv(deck: ReferenceDeck) {
    const content = exportDeckAsCsv(deck);
    downloadFile(content, `${deck.name}.csv`, "text/csv");
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label
            htmlFor="deck-name"
            className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]"
          >
            New deck name
          </label>
          <input
            id="deck-name"
            type="text"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Wes Anderson Pans"
            className="mt-2 block w-full rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-text-accent)] focus:outline-none"
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={!newDeckName.trim()}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--color-border-default)] px-5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          Create
        </button>
      </div>

      {decks.length === 0 ? (
        <div
          className="rounded-[var(--radius-xl)] border p-8 text-center"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <p className="text-sm text-[var(--color-text-secondary)]">
            No reference decks yet. Create one above, then add shots from the
            browse or shot detail pages.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {decks.map((deck) => (
            <article
              key={deck.id}
              className="rounded-[var(--radius-xl)] border p-6"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2
                    className="text-xl font-semibold text-[var(--color-text-primary)]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {deck.name}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-[var(--color-text-tertiary)]">
                    {deck.items.length}{" "}
                    {deck.items.length === 1 ? "shot" : "shots"} ·{" "}
                    {new Date(deck.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExportJson(deck)}
                    disabled={deck.items.length === 0}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border-default)] px-3 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] disabled:opacity-40"
                  >
                    <Download className="h-3 w-3" />
                    JSON
                  </button>
                  <button
                    onClick={() => handleExportCsv(deck)}
                    disabled={deck.items.length === 0}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border-default)] px-3 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] disabled:opacity-40"
                  >
                    <Download className="h-3 w-3" />
                    CSV
                  </button>
                  <button
                    onClick={() => handleDelete(deck.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border-default)] px-3 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              </div>

              {deck.items.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {deck.items.map((item) => (
                    <div
                      key={item.shotId}
                      className="group relative overflow-hidden rounded-[var(--radius-lg)] border"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
                        borderColor:
                          "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
                      }}
                    >
                      <Link href={`/shot/${item.shotId}`}>
                        {item.thumbnailUrl ? (
                          <div className="relative aspect-video">
                            <Image
                              src={item.thumbnailUrl}
                              alt={item.filmTitle}
                              fill
                              sizes="(min-width: 1280px) 280px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex aspect-video items-center justify-center bg-[var(--color-surface-tertiary)]">
                            <span className="text-xs text-[var(--color-text-tertiary)]">
                              No thumbnail
                            </span>
                          </div>
                        )}
                      </Link>
                      <div className="p-3">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {item.filmTitle}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--color-text-secondary)]">
                            {getFramingDisplayName(
                              item.framing as FramingSlug,
                            )}
                          </span>
                          <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--color-text-secondary)]">
                            {getShotSizeDisplayName(
                              item.shotSize as ShotSizeSlug,
                            )}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          handleRemoveShot(deck.id, item.shotId)
                        }
                        className="absolute right-2 top-2 hidden rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-red-500/80 group-hover:block"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                  No shots in this deck yet. Browse the archive and add shots to
                  build your reference.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
