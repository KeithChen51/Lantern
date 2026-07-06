"use client";

import * as React from "react";
import { useLhElementScrollProgress } from "@/hooks/use-lighthouse-motion";

export function HomeBrandHero() {
  const heroRef = React.useRef<HTMLElement | null>(null);
  const bgRef = React.useRef<HTMLDivElement | null>(null);
  const copyRef = React.useRef<HTMLDivElement | null>(null);
  const veilRef = React.useRef<HTMLDivElement | null>(null);

  useLhElementScrollProgress({
    ref: heroRef,
    onProgress: (progress) => {
      const bg = bgRef.current;
      const copy = copyRef.current;
      const veil = veilRef.current;
      if (!bg || !copy || !veil) return;
      bg.style.transform = `translate3d(0, ${progress * 72}px, 0) scale(${1.035 + progress * 0.015})`;
      copy.style.transform = `translate3d(0, ${progress * -34}px, 0)`;
      copy.style.opacity = String(1 - progress * 0.42);
      veil.style.opacity = String(0.92 + progress * 0.08);
    },
  });

  return (
    <section ref={heroRef} data-lh-home-brand-hero aria-labelledby="home-brand-title">
      <div ref={bgRef} data-lh-home-brand-bg aria-hidden="true" />
      <div ref={veilRef} data-lh-home-brand-veil aria-hidden="true" />
      <div ref={copyRef} data-lh-home-brand-copy>
        <p data-lh-home-brand-kicker>精诚服务品牌再出发</p>
        <h1 id="home-brand-title" data-lh-home-brand-title>
          求真、尽善、致美、大爱、幸福
        </h1>
        <a href="#heart-values" data-lh-home-brand-path>
          <span aria-hidden="true" />
          <span>查看价值路径</span>
        </a>
      </div>
    </section>
  );
}
