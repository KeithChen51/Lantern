"use client";

import * as React from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type RevealLayer = {
  targets: HTMLElement[];
  from: gsap.TweenVars;
  at?: string | number;
};

const REVEAL_DURATION = 0.72;

export function HeartMotion() {
  const controllerRef = React.useRef<HTMLSpanElement | null>(null);

  useGSAP(
    () => {
      const root = controllerRef.current?.closest<HTMLElement>("[data-lh-heart-page]");
      if (!root) return;

      const motion = gsap.matchMedia();

      motion.add(
        {
          wide: "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
          compact: "(max-width: 767px) and (prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const isWide = Boolean(context.conditions?.wide);
          const start = isWide ? "top 82%" : "top 88%";
          const lift = isWide ? 30 : 22;
          const drift = isWide ? 18 : 12;

          const one = (selector: string) => root.querySelector<HTMLElement>(selector);
          const within = (element: Element, selector: string) =>
            Array.from(element.querySelectorAll<HTMLElement>(selector));

          const reveal = (trigger: HTMLElement, layers: RevealLayer[]) => {
            const activeLayers = layers.filter((layer) => layer.targets.length > 0);
            const targets = activeLayers.flatMap((layer) => layer.targets);
            if (targets.length === 0) return;

            const timeline = gsap.timeline({
              defaults: {
                duration: REVEAL_DURATION,
                ease: "power3.out",
              },
              scrollTrigger: {
                trigger,
                start,
                once: true,
              },
              onStart: () => {
                gsap.set(targets, { willChange: "transform,opacity" });
              },
              onComplete: () => {
                gsap.set(targets, {
                  clearProps: "transform,opacity,willChange",
                });
              },
            });

            activeLayers.forEach((layer) => {
              timeline.from(layer.targets, layer.from, layer.at);
            });
          };

          const prologue = one("[data-lh-heart-prologue]");
          if (prologue) {
            reveal(prologue, [
              {
                targets: within(prologue, "[data-lh-heart-prologue-lead]"),
                from: { opacity: 0, y: lift },
                at: 0,
              },
              {
                targets: within(prologue, "[data-lh-heart-note]"),
                from: { opacity: 0, x: drift, y: lift * 0.2, stagger: 0.08 },
                at: 0.1,
              },
            ]);
          }

          const origin = one("[data-lh-heart-origin]");
          if (origin) {
            reveal(origin, [
              {
                targets: within(origin, "[data-lh-heart-origin-lead]"),
                from: { opacity: 0, y: lift },
                at: 0,
              },
              {
                targets: within(origin, "[data-lh-heart-origin-pair] article"),
                from: { opacity: 0, y: lift, scale: isWide ? 0.985 : 0.992, stagger: 0.08 },
                at: 0.1,
              },
            ]);
          }

          const values = one("[data-lh-heart-values]");
          if (values) {
            reveal(values, [
              {
                targets: within(values, "[data-lh-section-header]"),
                from: { opacity: 0, y: lift },
                at: 0,
              },
              {
                targets: within(values, "[data-lh-heart-value-summary] article"),
                from: { opacity: 0, y: lift, scale: isWide ? 0.992 : 0.996, stagger: 0.08 },
                at: 0.1,
              },
            ]);

            within(values, "[data-lh-heart-value-item]").forEach((item) => {
              reveal(item, [
                {
                  targets: within(item, "[data-lh-heart-value-surface]"),
                  from: { opacity: 0, scale: isWide ? 0.985 : 0.992 },
                  at: 0,
                },
                {
                  targets: within(
                    item,
                    ":scope > [data-lh-heart-value-heading], :scope > [data-lh-heart-value-summary-text], :scope > [data-lh-heart-viewpoints], :scope > [data-lh-heart-actions]",
                  ),
                  from: { opacity: 0, y: lift * 0.65, stagger: 0.06 },
                  at: 0.06,
                },
              ]);
            });
          }

          const next = one("[data-lh-heart-next]");
          if (next) {
            reveal(next, [
              {
                targets: within(next, "[data-lh-section-header]"),
                from: { opacity: 0, y: lift },
                at: 0,
              },
              {
                targets: within(next, "[data-lh-heart-guide-link]"),
                from: { opacity: 0, x: drift, y: lift * 0.2, stagger: 0.08 },
                at: 0.1,
              },
            ]);
          }

          const closing = one("[data-lh-heart-closing]");
          if (closing) {
            reveal(closing, [
              {
                targets: [closing],
                from: { opacity: 0, y: lift, scale: isWide ? 0.994 : 0.997 },
                at: 0,
              },
            ]);
          }
        },
      );

      return () => motion.revert();
    },
    { scope: controllerRef },
  );

  return <span ref={controllerRef} data-lh-heart-motion-controller hidden aria-hidden="true" />;
}
