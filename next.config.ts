import type { NextConfig } from "next";

/** Only API routes that import ingest-pipeline, ffmpeg-bin, or object-detection (ffmpeg; probing uses same binary). */
/** Do not add `./node_modules/.pnpm/**` — Vercel rejects traces rooted in pnpm's symlinked store. */
const FFMPEG_TRACE_INCLUDES = ["./node_modules/ffmpeg-static/**"];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/review-splits",
        destination: "/tuning",
        permanent: true,
      },
    ];
  },
  serverExternalPackages: ["ffmpeg-static"],
  /**
   * Binaries must be traced for routes that spawn ffmpeg.
   * Avoid a single glob over all API routes; that copies ffmpeg into every function and exceeds Vercel limits.
   * Picomatch contains-mode: pattern ingest-film matches ingest-film stream too.
   */
  outputFileTracingIncludes: {
    "/api/ingest-film": [...FFMPEG_TRACE_INCLUDES],
    "/api/process-scene": [...FFMPEG_TRACE_INCLUDES],
    "/api/detect-objects": [...FFMPEG_TRACE_INCLUDES],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.cloudfront.net",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
