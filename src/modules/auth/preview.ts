export const PREVIEW_USER_COOKIE = "lighthouse_preview_user_id";

export const PREVIEW_IDENTITY_IDS = ["user-demo", "admin-demo"] as const;

export type PreviewIdentityId = (typeof PREVIEW_IDENTITY_IDS)[number];

export function isPreviewIdentityId(userId: string): userId is PreviewIdentityId {
  return PREVIEW_IDENTITY_IDS.some((identityId) => identityId === userId);
}
