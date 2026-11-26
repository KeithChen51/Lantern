export const publicationChannels = ["group", "auto"] as const;
export type PublicationChannel = (typeof publicationChannels)[number];

export const MAX_ARTICLE_BYTES = 666 * 1024;
export const MAX_PUBLICATION_IMAGES = 10;
export const MAX_PUBLICATION_UPLOAD_BYTES = 32 * 1024 * 1024;
export const PUBLICATION_RECIPIENTS = {
  members: { max: 1000, pattern: /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,63}$/ },
  departments: { max: 100, pattern: /^[1-9]\d{0,15}$/ },
} as const;

export function imageMarker(index: number): string {
  return `__LANTERN_WECOM_IMAGE_${index}__`;
}

export type PublicationAudience =
  | { kind: "members" | "departments"; ids: string[] }
  | { kind: "all" };

export type PublicationTarget = { channel: PublicationChannel; audience: PublicationAudience };

export type ChannelInfo = {
  id: PublicationChannel;
  label: string;
  coverLimit: number;
  bodyImageLimit: number;
};

export type PublicationArticle = {
  title: string;
  digest: string;
  html: string;
  author?: string;
  sourceUrl?: string;
};

export type PublicationImage = {
  name: string;
  mimeType: "image/png" | "image/jpeg";
  bytes: Uint8Array;
};

export type NewPublicationDraft = {
  article: PublicationArticle;
  originalHtml: string;
  cover: PublicationImage;
  images: PublicationImage[];
};

export type PublicationDraft = Pick<PublicationArticle, "title" | "digest" | "author" | "sourceUrl"> & {
  id: string;
  createdAt: string;
};

export type PublicationActor = {
  userId: string;
  account: string;
  channel: "web" | "cli" | "mcp";
};

export type RecipientIssues = {
  invalidUsers: string[];
  invalidDepartments: string[];
  invalidTags: string[];
  unlicensedUsers: string[];
};

export type DeliveryOutcome =
  | { status: "accepted" | "partial"; messageId: string; issues: RecipientIssues }
  | { status: "failed" | "unknown"; code: string; message: string; issues?: RecipientIssues };

export type PublicationDelivery = PublicationTarget & {
  status: "queued" | "preparing" | "sending" | "accepted" | "partial" | "failed" | "unknown";
  attempts: number;
  attemptedAt?: string;
  finishedAt?: string;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  issues?: RecipientIssues;
};

export type PublicationTask = {
  id: string;
  draft: PublicationDraft;
  scheduledAt: string;
  createdAt: string;
  actor: PublicationActor;
  deliveries: PublicationDelivery[];
};
