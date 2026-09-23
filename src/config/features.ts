export function isGamesModuleEnabled() {
  return process.env.NEXT_PUBLIC_SHOW_GAMES === "true";
}
