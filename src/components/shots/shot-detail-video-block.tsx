"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { BoundaryHitlTools } from "@/components/shots/boundary-hitl-tools";
import { ShotPlayer } from "@/components/video/shot-player";
import { getShotPlaybackSegment } from "@/lib/shot-playback-segment";
import type { ShotWithDetails } from "@/lib/types";

type ShotDetailVideoBlockProps = {
  shot: ShotWithDetails;
  nextShotId: string | null;
};

export function ShotDetailVideoBlock({ shot, nextShotId }: ShotDetailVideoBlockProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [splitAt, setSplitAt] = useState("");
  const [timelineHoverIntoShotSec, setTimelineHoverIntoShotSec] = useState<number | null>(null);
  const playbackSegment = useMemo(() => getShotPlaybackSegment(shot), [shot]);

  useEffect(() => {
    setSplitAt("");
    setTimelineHoverIntoShotSec(null);
  }, [shot.id]);

  return (
    <div className="space-y-4">
      <ShotPlayer
        shot={shot}
        videoRef={videoRef}
        splitAt={splitAt}
        onSplitAtChange={setSplitAt}
        onTimelineHoverIntoShotChange={setTimelineHoverIntoShotSec}
      />
      <BoundaryHitlTools
        shotId={shot.id}
        startTc={shot.startTc}
        endTc={shot.endTc}
        clipMediaAnchorStartTc={shot.clipMediaAnchorStartTc}
        nextShotId={nextShotId}
        videoRef={videoRef}
        hasVideoClip={Boolean(shot.videoUrl)}
        videoUrlKey={shot.videoUrl}
        splitAt={splitAt}
        onSplitAtChange={setSplitAt}
        playheadSyncedByTransport={playbackSegment != null}
        timelineHoverIntoShotSec={timelineHoverIntoShotSec}
      />
    </div>
  );
}
