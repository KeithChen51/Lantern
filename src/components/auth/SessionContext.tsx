"use client";

import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import { registerBrowserSession, type WebSession } from "./auth-fetch";

const SessionContext = createContext<WebSession | null>(null);
export function SessionProvider({ session, children }: { session: WebSession; children: ReactNode }) {
  // Establish ownership before descendant effects or user actions can write.
  useLayoutEffect(() => registerBrowserSession(session), [session]);
  return <SessionContext.Provider key={`${session.kind ?? "employee"}:${session.user.id}`} value={session}>{children}</SessionContext.Provider>;
}
export function useEmployeeSession() { return useContext(SessionContext); }
