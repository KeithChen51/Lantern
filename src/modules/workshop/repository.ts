import {
  WorkshopReviewEventType as PrismaReviewEventType,
  WorkshopSubmissionStatus as PrismaSubmissionStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/infrastructure/db";
import type { OrgScope } from "@/modules/tenant";
import type {
  AiReviewResult,
  ContributionStat,
  CreateWorkshopDraftInput,
  PublishedWorkshopGuide,
  WorkshopGuideFilters,
  WorkshopRepository,
  WorkshopReviewEventType,
  WorkshopSubmission,
  WorkshopSubmissionStatus,
  WorkshopUser,
} from "./types";

type PrismaSubmission = Prisma.WorkshopSubmissionGetPayload<{
  include: { submitter: true; store: true };
}>;

type PrismaPublishedGuide = Prisma.PublishedGuideGetPayload<{
  include: {
    store: true;
    sourceSubmission: { include: { submitter: true; store: true } };
  };
}>;

type PrismaContributionStat = Prisma.ContributionStatGetPayload<{
  include: { user: true; store: true };
}>;

const statusToPrisma: Record<WorkshopSubmissionStatus, PrismaSubmissionStatus> = {
  draft: PrismaSubmissionStatus.DRAFT,
  submitted: PrismaSubmissionStatus.SUBMITTED,
  ai_rejected: PrismaSubmissionStatus.AI_REJECTED,
  pending_admin_review: PrismaSubmissionStatus.PENDING_ADMIN_REVIEW,
  admin_rejected: PrismaSubmissionStatus.ADMIN_REJECTED,
  published: PrismaSubmissionStatus.PUBLISHED,
  withdrawn: PrismaSubmissionStatus.WITHDRAWN,
};

const statusFromPrisma: Record<PrismaSubmissionStatus, WorkshopSubmissionStatus> = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  AI_REJECTED: "ai_rejected",
  PENDING_ADMIN_REVIEW: "pending_admin_review",
  ADMIN_REJECTED: "admin_rejected",
  PUBLISHED: "published",
  WITHDRAWN: "withdrawn",
};

const eventToPrisma: Record<WorkshopReviewEventType, PrismaReviewEventType> = {
  submit: PrismaReviewEventType.SUBMIT,
  ai_pass: PrismaReviewEventType.AI_PASS,
  ai_reject: PrismaReviewEventType.AI_REJECT,
  admin_reject: PrismaReviewEventType.ADMIN_REJECT,
  admin_edit: PrismaReviewEventType.ADMIN_EDIT,
  admin_publish: PrismaReviewEventType.ADMIN_PUBLISH,
  withdraw: PrismaReviewEventType.WITHDRAW,
};

function scopeWhere(scope?: OrgScope) {
  const where: {
    brandId?: string;
    regionId?: string;
    dealerId?: string;
    storeId?: string;
  } = {};

  if (!scope) return where;
  if (scope.brandId) where.brandId = scope.brandId;
  if (["region", "dealer", "store"].includes(scope.scopeType) && scope.regionId) where.regionId = scope.regionId;
  if (["dealer", "store"].includes(scope.scopeType) && scope.dealerId) where.dealerId = scope.dealerId;
  if (scope.scopeType === "store" && scope.storeId) where.storeId = scope.storeId;

  return where;
}

function mapSubmission(submission: PrismaSubmission): WorkshopSubmission {
  return {
    id: submission.id,
    submitterId: submission.submitterId,
    submitterName: submission.submitter.displayName,
    brandId: submission.brandId,
    regionId: submission.regionId,
    dealerId: submission.dealerId,
    storeId: submission.storeId,
    storeName: submission.store?.name ?? null,
    roleName: submission.roleName,
    serviceScenario: submission.serviceScenario,
    principleRef: submission.principleRef,
    title: submission.title,
    doText: submission.doText,
    howText: submission.howText,
    dontText: submission.dontText,
    status: statusFromPrisma[submission.status],
    aiReviewResult: submission.aiReviewResultJson as AiReviewResult | null,
    submittedAt: submission.submittedAt,
    lastReviewedAt: submission.lastReviewedAt,
    publishedGuideId: submission.publishedGuideId,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}

function mapGuide(guide: PrismaPublishedGuide): PublishedWorkshopGuide {
  return {
    id: guide.id,
    sourceSubmissionId: guide.sourceSubmissionId,
    title: guide.title,
    roleName: guide.roleName,
    serviceScenario: guide.serviceScenario,
    principleRef: guide.principleRef,
    doText: guide.doText,
    howText: guide.howText,
    dontText: guide.dontText,
    submitterName: guide.sourceSubmission.submitter.displayName,
    storeId: guide.storeId,
    storeName: guide.store?.name ?? guide.sourceSubmission.store?.name ?? null,
    publishedAt: guide.publishedAt,
  };
}

function mapContributionStat(stat: PrismaContributionStat): ContributionStat {
  return {
    userId: stat.userId,
    displayName: stat.user.displayName,
    storeName: stat.store?.name ?? null,
    submittedCount: stat.submittedCount,
    publishedCount: stat.publishedCount,
    latestPublishedAt: stat.latestPublishedAt,
  };
}

function patchToPrisma(patch: Partial<WorkshopSubmission>): Prisma.WorkshopSubmissionUpdateInput {
  const data: Prisma.WorkshopSubmissionUpdateInput = {};

  if (patch.title !== undefined) data.title = patch.title;
  if (patch.roleName !== undefined) data.roleName = patch.roleName;
  if (patch.serviceScenario !== undefined) data.serviceScenario = patch.serviceScenario;
  if (patch.principleRef !== undefined) data.principleRef = patch.principleRef;
  if (patch.doText !== undefined) data.doText = patch.doText;
  if (patch.howText !== undefined) data.howText = patch.howText;
  if (patch.dontText !== undefined) data.dontText = patch.dontText;
  if (patch.status !== undefined) data.status = statusToPrisma[patch.status];
  if (patch.aiReviewResult !== undefined) data.aiReviewResultJson = patch.aiReviewResult as Prisma.InputJsonValue;
  if (patch.submittedAt !== undefined) data.submittedAt = patch.submittedAt;
  if (patch.lastReviewedAt !== undefined) data.lastReviewedAt = patch.lastReviewedAt;
  if (patch.publishedGuideId !== undefined) data.publishedGuideId = patch.publishedGuideId;

  return data;
}

export class PrismaWorkshopRepository implements WorkshopRepository {
  async createSubmission(input: CreateWorkshopDraftInput, user: WorkshopUser) {
    const submission = await prisma.workshopSubmission.create({
      data: {
        submitterId: user.id,
        brandId: input.brandId,
        regionId: input.regionId,
        dealerId: input.dealerId,
        storeId: input.storeId,
        roleName: input.roleName,
        serviceScenario: input.serviceScenario,
        principleRef: input.principleRef,
        title: input.title,
        doText: input.doText,
        howText: input.howText,
        dontText: input.dontText,
        status: PrismaSubmissionStatus.DRAFT,
      },
      include: { submitter: true, store: true },
    });

    return mapSubmission(submission);
  }

  async findSubmissionById(id: string) {
    const submission = await prisma.workshopSubmission.findUnique({
      where: { id },
      include: { submitter: true, store: true },
    });

    return submission ? mapSubmission(submission) : null;
  }

  async updateSubmission(id: string, patch: Partial<WorkshopSubmission>) {
    const submission = await prisma.workshopSubmission.update({
      where: { id },
      data: patchToPrisma(patch),
      include: { submitter: true, store: true },
    });

    return mapSubmission(submission);
  }

  async addReviewEvent(event: Parameters<WorkshopRepository["addReviewEvent"]>[0]) {
    await prisma.workshopReviewEvent.create({
      data: {
        submissionId: event.submissionId,
        actorId: event.actorId,
        eventType: eventToPrisma[event.eventType],
        fromStatus: event.fromStatus ? statusToPrisma[event.fromStatus] : null,
        toStatus: event.toStatus ? statusToPrisma[event.toStatus] : null,
        comment: event.comment,
        snapshotJson: event.snapshot as Prisma.InputJsonValue,
      },
    });
  }

  async createPublishedGuide(submission: WorkshopSubmission) {
    const guide = await prisma.publishedGuide.create({
      data: {
        sourceSubmissionId: submission.id,
        brandId: submission.brandId,
        regionId: submission.regionId,
        dealerId: submission.dealerId,
        storeId: submission.storeId,
        roleName: submission.roleName,
        serviceScenario: submission.serviceScenario,
        principleRef: submission.principleRef,
        title: submission.title,
        doText: submission.doText,
        howText: submission.howText,
        dontText: submission.dontText,
      },
      include: {
        store: true,
        sourceSubmission: { include: { submitter: true, store: true } },
      },
    });

    return mapGuide(guide);
  }

  async incrementContributionStat(user: WorkshopUser, submission: WorkshopSubmission) {
    const where = {
      userId: user.id,
      brandId: submission.brandId,
      regionId: submission.regionId,
      dealerId: submission.dealerId,
      storeId: submission.storeId,
    };
    const existing = await prisma.contributionStat.findFirst({ where });
    const stat = existing
      ? await prisma.contributionStat.update({
          where: { id: existing.id },
          data: {
            publishedCount: { increment: 1 },
            submittedCount: existing.submittedCount === 0 ? 1 : existing.submittedCount,
            latestPublishedAt: new Date(),
          },
          include: { user: true, store: true },
        })
      : await prisma.contributionStat.create({
          data: {
            ...where,
            publishedCount: 1,
            submittedCount: 1,
            latestPublishedAt: new Date(),
          },
          include: { user: true, store: true },
        });

    return mapContributionStat(stat);
  }

  async listPersonalSubmissions(user: WorkshopUser) {
    const submissions = await prisma.workshopSubmission.findMany({
      where: { submitterId: user.id },
      include: { submitter: true, store: true },
      orderBy: { updatedAt: "desc" },
    });

    return submissions.map(mapSubmission);
  }

  async listPendingAdminReviews(scope?: OrgScope) {
    const submissions = await prisma.workshopSubmission.findMany({
      where: {
        status: PrismaSubmissionStatus.PENDING_ADMIN_REVIEW,
        ...scopeWhere(scope),
      },
      include: { submitter: true, store: true },
      orderBy: { submittedAt: "asc" },
    });

    return submissions.map(mapSubmission);
  }

  async listPublishedGuides(scope?: OrgScope, filters?: WorkshopGuideFilters) {
    const query = filters?.query?.trim();
    const where: Prisma.PublishedGuideWhereInput = {
      ...scopeWhere(scope),
      ...(filters?.roleName ? { roleName: filters.roleName } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query } },
              { roleName: { contains: query } },
              { serviceScenario: { contains: query } },
              { doText: { contains: query } },
              { dontText: { contains: query } },
            ],
          }
        : {}),
    };

    const guides = await prisma.publishedGuide.findMany({
      where,
      include: {
        store: true,
        sourceSubmission: { include: { submitter: true, store: true } },
      },
      orderBy: { publishedAt: "desc" },
    });

    return guides.map(mapGuide);
  }

  async getContributionLeaderboard(scope?: OrgScope) {
    const stats = await prisma.contributionStat.findMany({
      where: scopeWhere(scope),
      include: { user: true, store: true },
      orderBy: [{ publishedCount: "desc" }, { latestPublishedAt: "desc" }],
      take: 20,
    });

    return stats.map(mapContributionStat);
  }

  async findSimilarPublishedGuide(input: CreateWorkshopDraftInput) {
    const guide = await prisma.publishedGuide.findFirst({
      where: {
        OR: [
          { title: input.title },
          {
            roleName: input.roleName,
            serviceScenario: input.serviceScenario,
          },
        ],
      },
      include: {
        store: true,
        sourceSubmission: { include: { submitter: true, store: true } },
      },
    });

    return guide ? mapGuide(guide) : null;
  }
}

export const workshopRepository = new PrismaWorkshopRepository();
