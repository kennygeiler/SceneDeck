import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { platform as osPlatform } from "node:os";
import path from "node:path";

import ffmpegStatic from "ffmpeg-static";

const require = createRequire(import.meta.url);

/**
 * Shown when spawn() fails with ENOENT so logs point to setup instead of a raw stack trace.
 */
export const FFMPEG_SPAWN_ENOENT_HINT =
  "FFmpeg not found. On macOS: `brew install ffmpeg`. On Linux: `apt install ffmpeg`. " +
  "Or set `FFMPEG_PATH` / `FFMPEG_BIN` to an absolute ffmpeg binary. " +
  "Optional: `FFPROBE_PATH` if you probe via system ffprobe. " +
  "Ensure `pnpm install` ran `scripts/ensure-ffmpeg-static.cjs` so `node_modules/ffmpeg-static/ffmpeg` exists. " +
  "PySceneDetect runs `ffmpeg` via PATH — bundled paths only work if those dirs are prepended (see `envWithFfmpegBinariesOnPath`). " +
  "Vercel: trace includes in next.config; oversized bundles often come from ffprobe-static — we use ffmpeg for probing instead.";

function ffmpegFromNodeModulesRoot(root: string): string | null {
  const name = osPlatform() === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const p = path.join(root, "node_modules", "ffmpeg-static", name);
  return existsSync(p) ? p : null;
}

/** Resolves the real package dir (works with pnpm `.pnpm` layout). */
function ffmpegFromRequireResolve(): string | null {
  try {
    const pkg = require.resolve("ffmpeg-static/package.json");
    const dir = path.dirname(pkg);
    const name = osPlatform() === "win32" ? "ffmpeg.exe" : "ffmpeg";
    const p = path.join(dir, name);
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

export function getFfmpegPath(): string {
  const fromEnv = process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BIN?.trim();
  if (fromEnv) return fromEnv;
  const resolved = ffmpegFromRequireResolve();
  if (resolved) return resolved;
  if (typeof ffmpegStatic === "string" && ffmpegStatic.length > 0 && existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  const cwd = process.cwd();
  const fallback = ffmpegFromNodeModulesRoot(cwd);
  if (fallback) return fallback;
  return "ffmpeg";
}

/** Only used when callers need the real ffprobe binary (optional `FFPROBE_PATH` or PATH). */
export function getFfprobePath(): string {
  const env = process.env.FFPROBE_PATH?.trim();
  if (env) return env;
  return "ffprobe";
}

/**
 * ffmpeg with only `-i` writes probe info to stderr and exits non-zero (no output specified).
 * Fast header read — does not decode the whole file.
 */
function ffmpegProbeStderr(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ff = getFfmpegPath();
    const proc = spawn(ff, ["-hide_banner", "-i", filePath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e?.code === "ENOENT") {
        reject(new Error(`Command not found: ${ff}. ${FFMPEG_SPAWN_ENOENT_HINT}`));
        return;
      }
      reject(err);
    });
    proc.on("close", () => resolve(stderr));
  });
}

export function parseDurationSecFromFfmpegStderr(stderr: string): number {
  const m = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(s)) return 0;
  return h * 3600 + min * 60 + s;
}

export function parseVideoDimensionsFromFfmpegStderr(stderr: string): {
  width: number;
  height: number;
} | null {
  for (const line of stderr.split("\n")) {
    if (!line.includes("Video:")) continue;
    const m = line.match(/(\d{2,})x(\d{2,})/);
    if (!m) continue;
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }
  return null;
}

export async function probeVideoDurationSec(filePath: string): Promise<number> {
  const stderr = await ffmpegProbeStderr(filePath);
  return parseDurationSecFromFfmpegStderr(stderr);
}

export async function probeRasterDimensions(filePath: string): Promise<{
  width: number;
  height: number;
}> {
  const stderr = await ffmpegProbeStderr(filePath);
  const dims = parseVideoDimensionsFromFfmpegStderr(stderr);
  if (!dims) {
    throw new Error(`Could not determine dimensions for ${filePath}.`);
  }
  return dims;
}

/**
 * PySceneDetect calls `subprocess` with `ffmpeg` on PATH (see `scenedetect.platform.get_ffmpeg_path`).
 * Our Node code may use an absolute path from `ffmpeg-static`; we must expose that directory on PATH
 * when spawning `scenedetect`, or detection fails with spawn `ffmpeg` ENOENT.
 */
export function envWithFfmpegBinariesOnPath(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const dirs: string[] = [];
  const ff = getFfmpegPath();
  if (ff !== "ffmpeg" && ff !== "ffmpeg.exe" && existsSync(ff)) {
    dirs.push(path.dirname(ff));
  }
  const fp = getFfprobePath();
  if (fp !== "ffprobe" && fp !== "ffprobe.exe" && existsSync(fp)) {
    const d = path.dirname(fp);
    if (!dirs.includes(d)) dirs.push(d);
  }
  if (dirs.length === 0) {
    return { ...base };
  }
  const pathKeyWin = "Path";
  const pathKeyPosix = "PATH";
  const existing =
    base[pathKeyPosix] ??
    (base[pathKeyWin] as string | undefined) ??
    "";
  const prefix = dirs.join(path.delimiter);
  const merged = existing ? `${prefix}${path.delimiter}${existing}` : prefix;
  const next = { ...base, PATH: merged };
  if (process.platform === "win32") {
    (next as Record<string, string>)[pathKeyWin] = merged;
  }
  return next;
}
