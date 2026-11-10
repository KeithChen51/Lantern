import releaseRecords from "@/content/releases.json";

type ReleaseNotes = {
  title: string;
  summary: string;
  changes: { type: string; items: string[] }[];
};
type ReleaseRecord = ReleaseNotes & {
  version: string;
  date: string | null;
  userFacing: ReleaseNotes | null;
};

// Keep deployment details in the internal changelog, never fall back to them in the UI.
export function getUserFacingReleases(records: readonly ReleaseRecord[]) {
  return records.flatMap(({ version, date, userFacing }) =>
    userFacing ? [{ version, date, ...userFacing }] : [],
  );
}

// Records are newest first; current version also includes maintenance-only deliveries.
export const releases = getUserFacingReleases(releaseRecords);
export const currentRelease = releaseRecords[0];
export const currentVersion = currentRelease.version;
export const latestUserFacingVersion = releases[0]?.version ?? null;
