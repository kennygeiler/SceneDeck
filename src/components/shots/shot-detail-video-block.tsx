"use client";

import { useRef } from "react";

import { BoundaryHitlTools } from "@/components/shots/boundary-hitl-tools";
import { ShotPlayer } from "@/components/video/shot-player";
import type { ShotWithDetails } from "@/lib/types";

type ShotDetailVideoBlockProps = {
  shot: ShotWithDetails;
  nextShotId: string | null;
};

export function ShotDetailVideoBlock({ shot, nextShotId }: ShotDetailVideoBlockProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <div className="space-y-4">
      <ShotPlayer shot={shot} videoRef={videoRef} />
      <BoundaryHitlTools
        shotId={shot.id}
        startTc={shot.startTc}
        endTc={shot.endTc}
        nextShotId={nextShotId}
        videoRef={videoRef}
        hasVideoClip={Boolean(shot.videoUrl)}
      />
    </div>
  );
}
