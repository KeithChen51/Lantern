"use client";

import { useSyncExternalStore } from "react";
import { latestUserFacingVersion } from "@/lib/releases";

export const RELEASE_READ_KEY = "lighthouse:read-release";
const CHANGE_EVENT = "lighthouse:release-read";
let readInMemory: string | null = null;

function getSnapshot() {
  if (!latestUserFacingVersion) return true;
  try {
    return readInMemory === latestUserFacingVersion || localStorage.getItem(RELEASE_READ_KEY) === latestUserFacingVersion;
  } catch {
    return readInMemory === latestUserFacingVersion;
  }
}
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}
export function markCurrentReleaseRead() {
  if (!latestUserFacingVersion) return;
  readInMemory = latestUserFacingVersion;
  try { localStorage.setItem(RELEASE_READ_KEY, latestUserFacingVersion); } catch { /* Reading works without browser storage. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function useReleaseUnread() {
  // Hide the badge until hydration has checked this browser's read state.
  return !useSyncExternalStore(subscribe, getSnapshot, () => true);
}
