/**
 * Reference Deck — client-side curated shot collections.
 * Persisted in localStorage, exportable as JSON.
 */

import type { ShotWithDetails } from "@/lib/types";

export type ReferenceDeckItem = {
  shotId: string;
  filmTitle: string;
  director: string;
  framing: string;
  shotSize: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  addedAt: string;
};

export type ReferenceDeck = {
  id: string;
  name: string;
  description: string;
  items: ReferenceDeckItem[];
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "metrovision_reference_decks";

export function getDecks(): ReferenceDeck[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDecks(decks: ReferenceDeck[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
}

export function createDeck(name: string, description = ""): ReferenceDeck {
  const decks = getDecks();
  const deck: ReferenceDeck = {
    id: crypto.randomUUID(),
    name,
    description,
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  decks.push(deck);
  saveDecks(decks);
  return deck;
}

export function deleteDeck(deckId: string) {
  const decks = getDecks().filter((d) => d.id !== deckId);
  saveDecks(decks);
}

export function addShotToDeck(deckId: string, shot: ShotWithDetails) {
  const decks = getDecks();
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) return;
  if (deck.items.some((item) => item.shotId === shot.id)) return;

  deck.items.push({
    shotId: shot.id,
    filmTitle: shot.film.title,
    director: shot.film.director,
    framing: shot.metadata.framing,
    shotSize: shot.metadata.shotSize,
    thumbnailUrl: shot.thumbnailUrl,
    description: shot.semantic?.description ?? null,
    addedAt: new Date().toISOString(),
  });
  deck.updatedAt = new Date().toISOString();
  saveDecks(decks);
}

export function removeShotFromDeck(deckId: string, shotId: string) {
  const decks = getDecks();
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) return;
  deck.items = deck.items.filter((item) => item.shotId !== shotId);
  deck.updatedAt = new Date().toISOString();
  saveDecks(decks);
}

export function exportDeckAsJson(deck: ReferenceDeck): string {
  return JSON.stringify(deck, null, 2);
}

export function exportDeckAsCsv(deck: ReferenceDeck): string {
  const headers = [
    "Shot ID",
    "Film",
    "Director",
    "Framing",
    "Shot Size",
    "Description",
    "Thumbnail URL",
    "Added At",
  ];
  const rows = deck.items.map((item) =>
    [
      item.shotId,
      `"${item.filmTitle.replace(/"/g, '""')}"`,
      `"${item.director.replace(/"/g, '""')}"`,
      item.framing,
      item.shotSize,
      `"${(item.description ?? "").replace(/"/g, '""')}"`,
      item.thumbnailUrl ?? "",
      item.addedAt,
    ].join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
