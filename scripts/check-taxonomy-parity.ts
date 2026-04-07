/**
 * Fail if src/lib/taxonomy.ts and pipeline/taxonomy.py diverge (AC-02).
 * Compares each `export const NAME = { ... } as const` block to the matching
 * Python `NAME: Final[dict[str, TaxonomyEntry]] = { ... }` dict (keys + slug + displayName).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(SCRIPT_DIR, "..");
const TS_PATH = path.join(ROOT, "src/lib/taxonomy.ts");
const PY_PATH = path.join(ROOT, "pipeline/taxonomy.py");

type Entry = { slug: string; displayName: string };
type SectionMap = Map<string, Map<string, Entry>>;

function extractBraceBody(source: string, openIdx: number): { body: string; end: number } {
  let depth = 1;
  let i = openIdx;
  const bodyStart = i;
  while (i < source.length && depth > 0) {
    const c = source[i++];
    if (c === "{") depth++;
    else if (c === "}") depth--;
  }
  return { body: source.slice(bodyStart, i - 1), end: i };
}

function parseTsSections(source: string): SectionMap {
  const out: SectionMap = new Map();
  const re = /^export const (\w+) = \{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = m[1];
    const openEnd = m.index + m[0].length;
    const { body } = extractBraceBody(source, openEnd);
    const entries = new Map<string, Entry>();
    for (const line of body.split("\n")) {
      const lm = line.match(
        /^\s*(\w+):\s*\{\s*slug:\s*"([^"]*)",\s*displayName:\s*"([^"]*)"\s*\},?\s*$/,
      );
      if (lm) entries.set(lm[1], { slug: lm[2], displayName: lm[3] });
    }
    out.set(name, entries);
  }
  return out;
}

function parsePySections(source: string): SectionMap {
  const out: SectionMap = new Map();
  const re = /^(\w+): Final\[dict\[str, TaxonomyEntry\]\] = \{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = m[1];
    const openEnd = m.index + m[0].length;
    const { body } = extractBraceBody(source, openEnd);
    const entries = new Map<string, Entry>();
    for (const line of body.split("\n")) {
      const lm = line.match(
        /^\s*"([^"]+)":\s*\{\s*"slug":\s*"([^"]*)",\s*"displayName":\s*"([^"]*)"\s*\},?\s*$/,
      );
      if (lm) entries.set(lm[1], { slug: lm[2], displayName: lm[3] });
    }
    out.set(name, entries);
  }
  return out;
}

function compareSections(ts: SectionMap, py: SectionMap): string[] {
  const errors: string[] = [];
  const tsNames = new Set(ts.keys());
  const pyNames = new Set(py.keys());

  for (const name of tsNames) {
    if (!pyNames.has(name)) {
      errors.push(`Section "${name}" exists in taxonomy.ts but not in taxonomy.py`);
    }
  }
  for (const name of pyNames) {
    if (!tsNames.has(name)) {
      errors.push(`Section "${name}" exists in taxonomy.py but not in taxonomy.ts`);
    }
  }

  for (const name of tsNames) {
    if (!pyNames.has(name)) continue;
    const tm = ts.get(name)!;
    const pm = py.get(name)!;
    const tKeys = new Set(tm.keys());
    const pKeys = new Set(pm.keys());
    for (const k of tKeys) {
      if (!pKeys.has(k)) errors.push(`[${name}] key "${k}" missing in Python`);
    }
    for (const k of pKeys) {
      if (!tKeys.has(k)) errors.push(`[${name}] key "${k}" missing in TypeScript`);
    }
    for (const k of tKeys) {
      if (!pKeys.has(k)) continue;
      const a = tm.get(k)!;
      const b = pm.get(k)!;
      if (a.slug !== b.slug) {
        errors.push(`[${name}] "${k}" slug mismatch: TS "${a.slug}" vs PY "${b.slug}"`);
      }
      if (a.displayName !== b.displayName) {
        errors.push(
          `[${name}] "${k}" displayName mismatch: TS "${a.displayName}" vs PY "${b.displayName}"`,
        );
      }
    }
  }

  return errors;
}

const tsSource = fs.readFileSync(TS_PATH, "utf8");
const pySource = fs.readFileSync(PY_PATH, "utf8");
const tsSections = parseTsSections(tsSource);
const pySections = parsePySections(pySource);
const errors = compareSections(tsSections, pySections);

if (errors.length > 0) {
  console.error("[check-taxonomy-parity] FAILED:");
  for (const e of errors) console.error(" ", e);
  process.exit(1);
}

console.info(
  `[check-taxonomy-parity] OK — ${tsSections.size} sections, keys match between src/lib/taxonomy.ts and pipeline/taxonomy.py`,
);
process.exit(0);
