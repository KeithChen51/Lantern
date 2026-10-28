"use client";

import Link from "next/link";
import { useEffect, type ComponentProps } from "react";
import { parseReadingPosition, readingPositionKey, resourceReadingHref } from "./reading-return";

type EntryProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string; returnTo: string; entryId: string };
export function ReadingEntryLink({ href, returnTo, entryId, onClick, ...props }: EntryProps) {
  return <Link {...props} id={entryId} href={resourceReadingHref(href, returnTo, entryId)} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const position = { y: window.scrollY, anchor: entryId, savedAt: Date.now() };
    try {
      sessionStorage.setItem(readingPositionKey(returnTo), JSON.stringify(position));
      // Mark this history entry, so Back can restore it without making every
      // later visit to the same list an implicit return from reading.
      window.history.replaceState({ ...window.history.state, lighthouseReadingReturn: { returnTo, savedAt: position.savedAt } }, "");
    } catch { /* Anchor remains a storage-free fallback. */ }
  }} />;
}

/** Consumed once, so a later fresh visit does not unexpectedly jump down the list. */
export function ReadingListPosition({ returnTo }: { returnTo: string }) {
  useEffect(() => {
    let value: string | null = null;
    try { value = sessionStorage.getItem(readingPositionKey(returnTo)); } catch { return; }
    const position = parseReadingPosition(value);
    if (!position) return;
    const returnMarker = window.history.state?.lighthouseReadingReturn;
    const isHistoryReturn = returnMarker?.returnTo === returnTo && returnMarker?.savedAt === position.savedAt;
    const isLinkedReturn = window.location.hash === `#${encodeURIComponent(position.anchor)}`;
    if (!isHistoryReturn && !isLinkedReturn) return;
    let frame = 0;
    let attempts = 0;
    let cancelled = false;
    const restore = () => {
      if (cancelled) return;
      const entry = document.getElementById(position.anchor);
      if (entry && (document.documentElement.scrollHeight >= position.y + window.innerHeight || attempts > 8)) {
        entry.focus({ preventScroll: true });
        window.scrollTo({ top: position.y, behavior: "instant" });
        // Consume only after restoration. StrictMode may cancel the first
        // scheduled frame and replay this effect before anything has moved.
        try {
          if (sessionStorage.getItem(readingPositionKey(returnTo)) === value) sessionStorage.removeItem(readingPositionKey(returnTo));
        } catch { /* Restoration itself does not depend on storage writes. */ }
        return;
      }
      if (attempts++ < 12) frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [returnTo]);
  return null;
}
