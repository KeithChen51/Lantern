"use client";

import { useEffect } from "react";
import { markCurrentReleaseRead } from "@/components/layout/release-read-state";

export function MarkReleaseRead() {
  useEffect(() => { markCurrentReleaseRead(); }, []);
  return null;
}
