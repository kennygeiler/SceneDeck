/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS postinstall helper */
const { existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

/** When set, do not run ffmpeg-static’s GitHub download (use system ffmpeg, e.g. Docker/apt). */
const skipDownload =
  process.env.METROVISION_SKIP_FFMPEG_STATIC_DOWNLOAD === "1" ||
  process.env.METROVISION_SKIP_FFMPEG_STATIC_DOWNLOAD === "true";
if (skipDownload) {
  process.exit(0);
}

const installJs = path.join(__dirname, "..", "node_modules", "ffmpeg-static", "install.js");
let bundledPath;
try {
  bundledPath = require("ffmpeg-static");
} catch {
  process.exit(0);
}

if (typeof bundledPath === "string" && bundledPath.length > 0 && existsSync(bundledPath)) {
  process.exit(0);
}

try {
  execFileSync(process.execPath, [installJs], { stdio: "inherit" });
} catch {
  process.exit(0);
}
