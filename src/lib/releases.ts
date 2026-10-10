import releases from "@/content/releases.json";

// Records are newest first; validated by releases:check before building.
export { releases };
export const currentRelease = releases[0];
export const currentVersion = currentRelease.version;
