import { describe, expect, it } from "vitest";
import { createWorkshopService } from "./service";
import type {
  ContributionStat,
  CreateWorkshopDraftInput,
  PublishedWorkshopGuide,
  WorkshopRepository,
  WorkshopReviewEvent,
  WorkshopSubmission,
  WorkshopUser,
} from "./types";

class MemoryWorkshopRepository implements WorkshopRepository {
  submissions = new Map<string, WorkshopSubmission>();
  guides = new Map<string, PublishedWorkshopGuide>();
  stats = new Map<string, ContributionStat>();
  events: WorkshopReviewEvent[] = [];
  private sequence = 1;

  async createSubmission(input: CreateWorkshopDraftInput, user: WorkshopUser) {
    const submission: WorkshopSubmission = {
      ...input,
      id: `submission-${this.sequence++}`,
      submitterId: user.id,
      submitterName: user.displayName,
      status: "draft",
      aiReviewResult: null,
      submittedAt: null,
      lastReviewedAt: null,
      publishedGuideId: null,
      createdAt: new Date("2026-05-16T08:00:00.000Z"),
      updatedAt: new Date("2026-05-16T08:00:00.000Z"),
    };
    this.submissions.set(submission.id, submission);
    return submission;
  }

  async findSubmissionById(id: string) {
    return this.submissions.get(id) ?? null;
  }

  async updateSubmission(id: string, patch: Partial<WorkshopSubmission>) {
    const current = this.submissions.get(id);
    if (!current) {
      throw new Error(`Missing submission ${id}`);
    }
    const next = { ...current, ...patch, updatedAt: new Date("2026-05-16T08:01:00.000Z") };
    this.submissions.set(id, next);
    return next;
  }

  async addReviewEvent(event: Omit<WorkshopReviewEvent, "id" | "createdAt">) {
    this.events.push({
      ...event,
      id: `event-${this.events.length + 1}`,
      createdAt: new Date("2026-05-16T08:02:00.000Z"),
    });
  }

  async createPublishedGuide(submission: WorkshopSubmission) {
    const guide: PublishedWorkshopGuide = {
      id: `guide-${this.guides.size + 1}`,
      sourceSubmissionId: submission.id,
      title: submission.title,
      roleName: submission.roleName,
      serviceScenario: submission.serviceScenario,
      principleRef: submission.principleRef,
      doText: submission.doText,
      howText: submission.howText,
      dontText: submission.dontText,
      submitterName: submission.submitterName,
      storeId: submission.storeId,
      storeName: submission.storeName,
      publishedAt: new Date("2026-05-16T08:03:00.000Z"),
    };
    this.guides.set(guide.id, guide);
    return guide;
  }

  async incrementContributionStat(user: WorkshopUser, submission: WorkshopSubmission) {
    const existing = this.stats.get(user.id);
    const stat: ContributionStat = {
      userId: user.id,
      displayName: user.displayName,
      storeName: submission.storeName,
      submittedCount: existing?.submittedCount ?? 1,
      publishedCount: (existing?.publishedCount ?? 0) + 1,
      latestPublishedAt: new Date("2026-05-16T08:04:00.000Z"),
    };
    this.stats.set(user.id, stat);
    return stat;
  }

  async listPersonalSubmissions(user: WorkshopUser) {
    return [...this.submissions.values()].filter((submission) => submission.submitterId === user.id);
  }

  async listPendingAdminReviews() {
    return [...this.submissions.values()].filter((submission) => submission.status === "pending_admin_review");
  }

  async listPublishedGuides() {
    return [...this.guides.values()];
  }

  async getContributionLeaderboard() {
    return [...this.stats.values()].sort((a, b) => b.publishedCount - a.publishedCount);
  }

  async findSimilarPublishedGuide(input: CreateWorkshopDraftInput) {
    return (
      [...this.guides.values()].find(
        (guide) => guide.title === input.title || guide.serviceScenario === input.serviceScenario,
      ) ?? null
    );
  }
}

const normalUser: WorkshopUser = {
  id: "user-demo",
  displayName: "李明",
  role: "normal_user",
  scope: {
    userId: "user-demo",
    role: "normal_user",
    scopeType: "store",
    brandId: "brand-demo",
    regionId: "region-east",
    dealerId: "dealer-demo",
    storeId: "store-xinghe",
  },
};

const adminUser: WorkshopUser = {
  id: "admin-demo",
  displayName: "品牌方管理员",
  role: "highest_admin",
  scope: {
    userId: "admin-demo",
    role: "highest_admin",
    scopeType: "brand",
    brandId: "brand-demo",
    regionId: null,
    dealerId: null,
    storeId: null,
  },
};

const validDraft: CreateWorkshopDraftInput = {
  title: "客户等待时间超预期时的主动说明",
  roleName: "服务顾问",
  brandId: "brand-demo",
  regionId: "region-east",
  dealerId: "dealer-demo",
  storeId: "store-xinghe",
  storeName: "星河店",
  serviceScenario: "维修等待",
  principleRef: "本心 / 主动透明",
  doText: "主动说明当前进度、延时原因和新的预计等待时间。",
  howText: "先向车间确认进度，再用客户能理解的话解释原因。",
  dontText: "不要等客户反复追问后才被动回应。",
};

describe("workshop service", () => {
  it("moves draft to submitted and then pending admin review after initial review passes", async () => {
    const service = createWorkshopService(new MemoryWorkshopRepository());
    const draft = await service.createDraft(validDraft, normalUser);

    const submitted = await service.submitForReview(draft.id, normalUser);
    const reviewed = await service.runInitialReview(submitted.id);

    expect(submitted.status).toBe("submitted");
    expect(reviewed.status).toBe("pending_admin_review");
    expect(reviewed.aiReviewResult?.passed).toBe(true);
  });

  it("moves submitted content to AI rejected when it duplicates a published guide", async () => {
    const repository = new MemoryWorkshopRepository();
    const service = createWorkshopService(repository);
    const draft = await service.createDraft(validDraft, normalUser);
    const submitted = await service.submitForReview(draft.id, normalUser);
    const reviewed = await service.runInitialReview(submitted.id);
    await service.publishSubmission(reviewed.id, adminUser);

    const duplicate = await service.createDraft(validDraft, normalUser);
    const duplicateSubmitted = await service.submitForReview(duplicate.id, normalUser);
    const duplicateReviewed = await service.runInitialReview(duplicateSubmitted.id);

    expect(duplicateReviewed.status).toBe("ai_rejected");
    expect(duplicateReviewed.aiReviewResult?.reason).toContain("duplicate");
  });

  it("lets the submitter revise an AI-rejected submission before resubmitting", async () => {
    const service = createWorkshopService(new MemoryWorkshopRepository());
    const incomplete = await service.createDraft(
      {
        ...validDraft,
        doText: "short",
        howText: null,
        dontText: "short",
      },
      normalUser,
    );
    const rejected = await service.runInitialReview((await service.submitForReview(incomplete.id, normalUser)).id);

    const revised = await service.reviseSubmission(rejected.id, normalUser, {
      doText: validDraft.doText,
      dontText: validDraft.dontText,
    });

    expect(revised.status).toBe("draft");
    expect(revised.aiReviewResult).toBeNull();
    expect(revised.doText).toBe(validDraft.doText);
  });

  it("blocks non-owners from revising a personal submission", async () => {
    const service = createWorkshopService(new MemoryWorkshopRepository());
    const draft = await service.createDraft(validDraft, normalUser);

    await expect(service.reviseSubmission(draft.id, adminUser, { title: "Should not change" })).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("allows the highest admin to reject a pending submission", async () => {
    const service = createWorkshopService(new MemoryWorkshopRepository());
    const draft = await service.createDraft(validDraft, normalUser);
    const reviewed = await service.runInitialReview((await service.submitForReview(draft.id, normalUser)).id);

    const rejected = await service.rejectSubmission(reviewed.id, adminUser, "需要补充可执行细节");

    expect(rejected.status).toBe("admin_rejected");
    expect(rejected.lastReviewedAt).toBeInstanceOf(Date);
  });

  it("publishes a guide and updates contribution stats", async () => {
    const repository = new MemoryWorkshopRepository();
    const service = createWorkshopService(repository);
    const draft = await service.createDraft(validDraft, normalUser);
    const reviewed = await service.runInitialReview((await service.submitForReview(draft.id, normalUser)).id);

    const guide = await service.publishSubmission(reviewed.id, adminUser);
    const leaderboard = await service.getContributionLeaderboard(adminUser.scope);

    expect(guide).toMatchObject({
      title: validDraft.title,
      sourceSubmissionId: reviewed.id,
    });
    expect((await repository.findSubmissionById(reviewed.id))?.status).toBe("published");
    expect(leaderboard).toEqual([
      expect.objectContaining({
        userId: normalUser.id,
        publishedCount: 1,
      }),
    ]);
  });

  it("supports admin edit before publish", async () => {
    const service = createWorkshopService(new MemoryWorkshopRepository());
    const draft = await service.createDraft(validDraft, normalUser);
    const reviewed = await service.runInitialReview((await service.submitForReview(draft.id, normalUser)).id);

    const guide = await service.publishSubmission(reviewed.id, adminUser, {
      title: "客户等待超预期时的三步沟通动作",
      howText: "确认进度、解释原因、给出下一次更新时间。",
    });

    expect(guide.title).toBe("客户等待超预期时的三步沟通动作");
    expect(guide.howText).toBe("确认进度、解释原因、给出下一次更新时间。");
  });
});
