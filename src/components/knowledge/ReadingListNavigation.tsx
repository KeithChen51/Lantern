"use client";

import Link from "next/link";
import { useEffect, type ComponentProps } from "react";
import { parseReadingPosition, readingPositionKey, resourceReadingHref } from "./reading-return";

type EntryProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string; returnTo: string; entryId: string };
export function ReadingEntryLink({ href, returnTo, entryId, onClick, ...props }: EntryProps) {
  return <Link {...props} id={entryId} href={resourceReadingHref(href, returnTo, entryId)} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try { sessionStorage.setItem(readingPositionKey(returnTo), JSON.stringify({ y: window.scrollY, anchor: entryId, savedAt: Date.now() })); } catch { /* Anchor remains a storage-free fallback. */ }
  }} />;
}

/** Consumed once, so a later fresh visit does not unexpectedly jump down the list. */
export function ReadingListPosition({ returnTo }: { returnTo: string }) {
  useEffect(() => {
    let value: string | null = null;
    try { value = sessionStorage.getItem(readingPositionKey(returnTo)); sessionStorage.removeItem(readingPositionKey(returnTo)); } catch { return; }
    const position = parseReadingPosition(value);
    if (!position) return;
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      const entry = document.getElementById(position.anchor);
      if (entry && (document.documentElement.scrollHeight >= position.y + window.innerHeight || attempts > 8)) {
        entry.focus({ preventScroll: true });
        window.scrollTo({ top: position.y, behavior: "instant" });
        return;
      }
      if (attempts++ < 12) frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [returnTo]);
  return null;
}
