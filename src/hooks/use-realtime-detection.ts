"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type {
  DetectedObject,
  ObjectDetection,
} from "@tensorflow-models/coco-ssd";

export type RealtimeDetection = {
  className: string;
  score: number;
  bbox: [number, number, number, number];
};

type UseRealtimeDetectionOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  fps?: number;
  minConfidence?: number;
};

export function useRealtimeDetection({
  videoRef,
  enabled,
  fps = 5,
  minConfidence = 0.5,
}: UseRealtimeDetectionOptions) {
  const [detections, setDetections] = useState<RealtimeDetection[]>([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const modelRef = useRef<ObjectDetection | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastDetectTimeRef = useRef(0);
  const isDetectingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setDetections([]);
      setLoadError(null);
      return;
    }

    if (modelRef.current) {
      setIsModelLoaded(true);
      return;
    }

    let cancelled = false;

    async function loadModel() {
      try {
        setIsLoading(true);
        setLoadError(null);

        const tf = await import("@tensorflow/tfjs");
        await tf.ready();

        const cocoSsd = await import("@tensorflow-models/coco-ssd");
        const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });

        if (cancelled) {
          return;
        }

        modelRef.current = model;
        setIsModelLoaded(true);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Model failed to load.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadModel();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isModelLoaded) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      setDetections([]);
      return;
    }

    let cancelled = false;
    const interval = 1000 / fps;

    const tick = async () => {
      const video = videoRef.current;

      if (cancelled) {
        return;
      }

      if (!video || !modelRef.current) {
        frameRef.current = requestAnimationFrame(() => {
          void tick();
        });
        return;
      }

      if (
        !video.paused &&
        !video.ended &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !isDetectingRef.current
      ) {
        const now = performance.now();

        if (now - lastDetectTimeRef.current >= interval) {
          lastDetectTimeRef.current = now;
          isDetectingRef.current = true;

          try {
            const predictions = await modelRef.current.detect(video) as DetectedObject[];

            if (!cancelled) {
              setDetections(
                predictions
                  .filter((prediction) => prediction.score >= minConfidence)
                  .map((prediction) => ({
                    className: prediction.class,
                    score: prediction.score,
                    bbox: prediction.bbox as [number, number, number, number],
                  })),
              );
            }
          } catch {
            if (!cancelled) {
              setDetections([]);
            }
          } finally {
            isDetectingRef.current = false;
          }
        }
      }

      frameRef.current = requestAnimationFrame(() => {
        void tick();
      });
    };

    frameRef.current = requestAnimationFrame(() => {
      void tick();
    });

    return () => {
      cancelled = true;
      isDetectingRef.current = false;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [enabled, fps, isModelLoaded, minConfidence, videoRef]);

  return {
    detections,
    isModelLoaded,
    isLoading,
    loadError,
  };
}
