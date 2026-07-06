"use client";

import * as React from "react";

type ScrollProgressOptions = {
  enabled?: boolean;
  range?: number;
  respectReducedMotion?: boolean;
  onProgress: (progress: number) => void;
};

type ElementProgressOptions<T extends HTMLElement> = {
  ref: React.RefObject<T | null>;
  enabled?: boolean;
  respectReducedMotion?: boolean;
  onProgress: (progress: number) => void;
};

export function useLhReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

export function useLhScrollProgress({
  enabled = true,
  range = 1,
  respectReducedMotion = true,
  onProgress,
}: ScrollProgressOptions) {
  const prefersReducedMotion = useLhReducedMotion();
  const onProgressRef = React.useRef(onProgress);

  React.useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  React.useEffect(() => {
    if (!enabled || (respectReducedMotion && prefersReducedMotion)) return;

    let animationFrame = 0;

    const updateProgress = () => {
      animationFrame = 0;
      const viewportHeight = window.innerHeight || 1;
      const denominator = Math.max(viewportHeight * range, 1);
      const progress = Math.min(Math.max(window.scrollY / denominator, 0), 1);
      onProgressRef.current(progress);
    };

    const scheduleUpdate = () => {
      if (animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(updateProgress);
      }
    };

    updateProgress();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [enabled, prefersReducedMotion, range, respectReducedMotion]);
}

export function useLhElementScrollProgress<T extends HTMLElement>({
  ref,
  enabled = true,
  respectReducedMotion = true,
  onProgress,
}: ElementProgressOptions<T>) {
  const prefersReducedMotion = useLhReducedMotion();
  const onProgressRef = React.useRef(onProgress);

  React.useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  React.useEffect(() => {
    if (!enabled || (respectReducedMotion && prefersReducedMotion)) return;

    let animationFrame = 0;

    const updateProgress = () => {
      animationFrame = 0;
      const element = ref.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      const progress = Math.min(Math.max(-rect.top / viewportHeight, 0), 1);
      onProgressRef.current(progress);
    };

    const scheduleUpdate = () => {
      if (animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(updateProgress);
      }
    };

    updateProgress();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [enabled, prefersReducedMotion, ref, respectReducedMotion]);
}
