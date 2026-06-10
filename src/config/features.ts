export function isPublicWorkshopEnabled() {
  return process.env.NEXT_PUBLIC_SHOW_WORKSHOP === "true";
}
