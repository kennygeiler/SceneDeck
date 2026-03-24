// ---------------------------------------------------------------------------
// Internet Archive film scraper for MetroVision 50-film pilot
// ---------------------------------------------------------------------------

export type ArchiveFilm = {
  identifier: string;
  title: string;
  director: string;
  year: number | null;
  sourceUrl: string;
  fileSize: number | null;
  duration: number | null;
};

type ArchiveSearchDoc = {
  identifier?: string;
  title?: string;
  creator?: string;
  date?: string;
  item_size?: number;
};

type ArchiveSearchResponse = {
  response?: {
    docs?: ArchiveSearchDoc[];
  };
};

type ArchiveFileEntry = {
  name?: string;
  format?: string;
  size?: string;
  length?: string;
};

type ArchiveMetadataFilesResponse = {
  result?: ArchiveFileEntry[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDirector(creator: string | undefined): string {
  if (!creator) return "Unknown";
  // Take the first name if comma-separated list
  const first = creator.split(",")[0].trim();
  return first || "Unknown";
}

function parseYear(date: string | undefined): number | null {
  if (!date) return null;
  const match = date.match(/(\d{4})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  if (year < 1880 || year > 2030) return null;
  return year;
}

// ---------------------------------------------------------------------------
// Fetch mp4 info from Archive metadata API
// ---------------------------------------------------------------------------

async function fetchMp4Info(
  identifier: string,
): Promise<{ url: string; size: number | null; duration: number | null } | null> {
  try {
    const res = await fetch(
      `https://archive.org/metadata/${identifier}/files`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as ArchiveMetadataFilesResponse;
    const files = data.result ?? [];

    // Find the best mp4 file (prefer larger / original)
    const mp4 = files.find(
      (f) =>
        f.name?.toLowerCase().endsWith(".mp4") &&
        f.format?.toLowerCase() !== "metadata",
    );

    if (!mp4?.name) return null;

    return {
      url: `https://archive.org/download/${identifier}/${encodeURIComponent(mp4.name)}`,
      size: mp4.size ? parseInt(mp4.size, 10) || null : null,
      duration: mp4.length ? parseFloat(mp4.length) || null : null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main search
// ---------------------------------------------------------------------------

export async function searchArchiveFilms(
  count: number = 50,
): Promise<ArchiveFilm[]> {
  const rows = count * 3;

  const params = new URLSearchParams({
    q: "mediatype:movies AND collection:feature_films",
    fl: "identifier,title,creator,date,item_size",
    output: "json",
    rows: String(rows),
    sort: "downloads desc",
  });

  const res = await fetch(
    `https://archive.org/advancedsearch.php?${params.toString()}`,
  );

  if (!res.ok) {
    throw new Error(
      `Archive.org search failed: ${res.status} ${res.statusText}`,
    );
  }

  const data = (await res.json()) as ArchiveSearchResponse;
  const docs = data.response?.docs ?? [];

  // Pre-filter: must have title and year
  const candidates = docs
    .map((doc) => ({
      identifier: doc.identifier ?? "",
      title: (doc.title ?? "").trim(),
      director: parseDirector(doc.creator),
      year: parseYear(doc.date),
      itemSize: doc.item_size ?? null,
    }))
    .filter((c) => c.identifier && c.title && c.year !== null);

  // Fetch mp4 info in parallel (batched to avoid overwhelming the API)
  const CONCURRENCY = 5;
  const results: ArchiveFilm[] = [];

  for (let i = 0; i < candidates.length && results.length < count; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);

    const mp4Infos = await Promise.all(
      batch.map((c) => fetchMp4Info(c.identifier)),
    );

    for (let j = 0; j < batch.length; j++) {
      if (results.length >= count) break;

      const candidate = batch[j];
      const mp4 = mp4Infos[j];

      if (!mp4) continue;

      results.push({
        identifier: candidate.identifier,
        title: candidate.title,
        director: candidate.director,
        year: candidate.year,
        sourceUrl: mp4.url,
        fileSize: mp4.size,
        duration: mp4.duration,
      });
    }
  }

  return results;
}
