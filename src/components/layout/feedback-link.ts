export function getFeedbackHref(pathname: string) {
  const sourcePath = pathname.trim() || "/";
  return `/feedback?from=${encodeURIComponent(sourcePath)}`;
}
