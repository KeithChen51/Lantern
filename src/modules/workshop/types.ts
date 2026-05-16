import type { AppRole, OrgScope } from "@/modules/tenant";

export type WorkshopSubmissionStatus =
  | "draft"
  | "submitted"
  | "ai_rejected"
  | "pending_admin_review"
  | "admin_rejected"
  | "published"
  | "withdrawn";

export type WorkshopReviewEventType =
  | "submit"
  | "ai_pass"
  | "ai_reject"
  | "admin_reject"
  | "admin_edit"
  | "admin_publish"
  | "withdraw";

export type WorkshopUser = {
  id: string;
  displayName: string;
  role: AppRole;
  scope: OrgScope;
};

export type AiReviewResult = {
  passed: boolean;
  reason: string;
  checkedAt: string;
};

export type CreateWorkshopDraftInput = {
  title: string;
  roleName: string;
  brandId: string | null;
  regionId: string | null;
  dealerId: string | null;
  storeId: string | null;
  storeName: string | null;
  serviceScenario: string | null;
  principleRef: string | null;
  doText: string;
  howText: string | null;
  dontText: string;
};

export type EditableWorkshopContent = Partial<
  Pick<CreateWorkshopDraftInput, "title" | "roleName" | "serviceScenario" | "principleRef" | "doText" | "howText" | "dontText">
>;

export type WorkshopSubmission = CreateWorkshopDraftInput & {
  id: string;
  submitterId: string;
  submitterName: string;
  status: WorkshopSubmissionStatus;
  aiReviewResult: AiReviewResult | null;
  submittedAt: Date | null;
  lastReviewedAt: Date | null;
  publishedGuideId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkshopReviewEvent = {
  id: string;
  submissionId: string;
  actorId: string | null;
  eventType: WorkshopReviewEventType;
  fromStatus: WorkshopSubmissionStatus | null;
  toStatus: WorkshopSubmissionStatus | null;
  comment: string | null;
  snapshot: unknown;
  createdAt: Date;
};

export type PublishedWorkshopGuide = {
  id: string;
  sourceSubmissionId: string;
  title: string;
  roleName: string;
  serviceScenario: string | null;
  principleRef: string | null;
  doText: string;
  howText: string | null;
  dontText: string;
  submitterName: string;
  storeId: string | null;
  storeName: string | null;
  publishedAt: Date;
};

export type ContributionStat = {
  userId: string;
  displayName: string;
  storeName: string | null;
  submittedCount: number;
  publishedCount: number;
  latestPublishedAt: Date | null;
};

export type WorkshopGuideFilters = {
  roleName?: string | null;
  query?: string | null;
};

export interface WorkshopRepository {
  createSubmission(input: CreateWorkshopDraftInput, user: WorkshopUser): Promise<WorkshopSubmission>;
  findSubmissionById(id: string): Promise<WorkshopSubmission | null>;
  updateSubmission(id: string, patch: Partial<WorkshopSubmission>): Promise<WorkshopSubmission>;
  addReviewEvent(event: Omit<WorkshopReviewEvent, "id" | "createdAt">): Promise<void>;
  createPublishedGuide(submission: WorkshopSubmission): Promise<PublishedWorkshopGuide>;
  incrementContributionStat(user: WorkshopUser, submission: WorkshopSubmission): Promise<ContributionStat>;
  listPersonalSubmissions(user: WorkshopUser): Promise<WorkshopSubmission[]>;
  listPendingAdminReviews(scope?: OrgScope): Promise<WorkshopSubmission[]>;
  listPublishedGuides(scope?: OrgScope, filters?: WorkshopGuideFilters): Promise<PublishedWorkshopGuide[]>;
  getContributionLeaderboard(scope?: OrgScope): Promise<ContributionStat[]>;
  findSimilarPublishedGuide(input: CreateWorkshopDraftInput): Promise<PublishedWorkshopGuide | null>;
}
