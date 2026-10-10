"use client";

import { useSyncExternalStore } from "react";
import { currentVersion } from "@/lib/releases";

export const RELEASE_READ_KEY = "lighthouse:read-release";
const CHANGE_EVENT = "lighthouse:release-read";
let readInMemory: string | null = null;

function getSnapshot() {
  try {
    return readInMemory === currentVersion || localStorage.getItem(RELEASE_READ_KEY) === currentVersion;
  } catch {
    return readInMemory === currentVersion;
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
  readInMemory = currentVersion;
  try { localStorage.setItem(RELEASE_READ_KEY, currentVersion); } catch { /* Reading works without browser storage. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function useReleaseUnread() {
  // Hide the badge until hydration has checked this browser's read state.
  return !useSyncExternalStore(subscribe, getSnapshot, () => true);
}
