"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WebSession } from "./auth-fetch";

const SessionContext = createContext<WebSession | null>(null);
export function SessionProvider({ session, children }: { session: WebSession; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
export function useEmployeeSession() { return useContext(SessionContext); }
