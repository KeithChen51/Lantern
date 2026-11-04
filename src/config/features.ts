export function isGamesModuleEnabled() {
  return process.env.NEXT_PUBLIC_SHOW_GAMES !== "false";
}

// Administrator transcript access is suspended pending a new access policy.
// Keep conversation persistence and personal history independent of this gate.
export function isHermitRecordsEnabled() {
  return false;
}
