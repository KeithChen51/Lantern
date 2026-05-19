import { AppError } from "@/shared/errors";
import type {
  AiReviewResult,
  CreateWorkshopDraftInput,
  EditableWorkshopContent,
  WorkshopRepository,
  WorkshopSubmission,
  WorkshopUser,
} from "./types";

const MIN_ACTION_LENGTH = 8;

function ensureAdmin(user: WorkshopUser) {
  if (user.role !== "highest_admin") {
    throw new AppError("forbidden", "Highest-admin role is required.", 403);
  }
}

function ensureOwner(submission: WorkshopSubmission, user: WorkshopUser) {
  if (submission.submitterId !== user.id) {
    throw new AppError("forbidden", "Only the submitter can change this submission.", 403);
  }
}

function ensureTransition(submission: WorkshopSubmission, allowed: WorkshopSubmission["status"][]) {
  if (!allowed.includes(submission.status)) {
    throw new AppError(
      "invalid_transition",
      `Submission ${submission.id} cannot move from ${submission.status}.`,
      409,
    );
  }
}

function validateDraftInput(input: CreateWorkshopDraftInput) {
  const requiredFields = [input.title, input.roleName];
  if (requiredFields.some((value) => value.trim().length === 0)) {
    throw new AppError("validation_error", "Title and role are required.", 422);
  }

  if (input.doText.trim().length === 0 && input.dontText.trim().length === 0) {
    throw new AppError("validation_error", "At least one of Do or Don't is required.", 422);
  }
}

function buildAiReviewResult(passed: boolean, reason: string): AiReviewResult {
  return {
    passed,
    reason,
    checkedAt: new Date().toISOString(),
  };
}

function isCompleteForReview(submission: WorkshopSubmission) {
  const actionTexts = [submission.doText, submission.dontText].map((text) => text.trim()).filter(Boolean);

  return (
    submission.title.trim().length > 0 &&
    submission.roleName.trim().length > 0 &&
    actionTexts.length > 0 &&
    actionTexts.every((text) => text.length >= MIN_ACTION_LENGTH) &&
    (!submission.howText || submission.howText.trim().length >= MIN_ACTION_LENGTH)
  );
}

export class WorkshopService {
  constructor(private readonly repository: WorkshopRepository) {}

  async createDraft(input: CreateWorkshopDraftInput, user: WorkshopUser) {
    validateDraftInput(input);

    if (user.scope.scopeType === "store" && input.storeId && user.scope.storeId !== input.storeId) {
      throw new AppError("forbidden", "Store scope does not allow submitting for this store.", 403);
    }

    return this.repository.createSubmission(input, user);
  }

  async submitForReview(id: string, user: WorkshopUser) {
    const submission = await this.requireSubmission(id);
    ensureOwner(submission, user);
    ensureTransition(submission, ["draft", "ai_rejected", "admin_rejected"]);

    const next = await this.repository.updateSubmission(id, {
      status: "submitted",
      submittedAt: new Date(),
      aiReviewResult: null,
    });

    await this.repository.addReviewEvent({
      submissionId: id,
      actorId: user.id,
      eventType: "submit",
      fromStatus: submission.status,
      toStatus: "submitted",
      comment: null,
      snapshot: next,
    });

    return next;
  }

  async reviseSubmission(id: string, user: WorkshopUser, content: EditableWorkshopContent) {
    const submission = await this.requireSubmission(id);
    ensureOwner(submission, user);
    ensureTransition(submission, ["draft", "ai_rejected", "admin_rejected"]);

    const nextContent = {
      title: content.title ?? submission.title,
      roleName: content.roleName ?? submission.roleName,
      brandId: submission.brandId,
      regionId: submission.regionId,
      dealerId: submission.dealerId,
      storeId: submission.storeId,
      storeName: submission.storeName,
      serviceScenario: content.serviceScenario === undefined ? submission.serviceScenario : content.serviceScenario,
      principleRef: content.principleRef === undefined ? submission.principleRef : content.principleRef,
      doText: content.doText ?? submission.doText,
      howText: content.howText === undefined ? submission.howText : content.howText,
      dontText: content.dontText ?? submission.dontText,
    };

    validateDraftInput(nextContent);

    return this.repository.updateSubmission(id, {
      ...nextContent,
      status: "draft",
      aiReviewResult: null,
    });
  }

  async runInitialReview(id: string) {
    const submission = await this.requireSubmission(id);
    ensureTransition(submission, ["submitted"]);

    const similarGuide = await this.repository.findSimilarPublishedGuide(submission);
    const passed = !similarGuide && isCompleteForReview(submission);
    const status = passed ? "pending_admin_review" : "ai_rejected";
    const reason = similarGuide
      ? `duplicate: similar guide ${similarGuide.id}`
      : passed
        ? "passed"
        : "content is incomplete";

    const aiReviewResult = buildAiReviewResult(passed, reason);
    const next = await this.repository.updateSubmission(id, {
      status,
      aiReviewResult,
      lastReviewedAt: new Date(),
    });

    await this.repository.addReviewEvent({
      submissionId: id,
      actorId: null,
      eventType: passed ? "ai_pass" : "ai_reject",
      fromStatus: submission.status,
      toStatus: status,
      comment: reason,
      snapshot: aiReviewResult,
    });

    return next;
  }

  async listPersonalSubmissions(user: WorkshopUser) {
    return this.repository.listPersonalSubmissions(user);
  }

  async listPendingAdminReviews(admin: WorkshopUser) {
    ensureAdmin(admin);
    return this.repository.listPendingAdminReviews(admin.scope);
  }

  async rejectSubmission(id: string, admin: WorkshopUser, comment: string) {
    ensureAdmin(admin);
    const submission = await this.requireSubmission(id);
    ensureTransition(submission, ["pending_admin_review"]);

    const next = await this.repository.updateSubmission(id, {
      status: "admin_rejected",
      lastReviewedAt: new Date(),
    });

    await this.repository.addReviewEvent({
      submissionId: id,
      actorId: admin.id,
      eventType: "admin_reject",
      fromStatus: submission.status,
      toStatus: "admin_rejected",
      comment,
      snapshot: next,
    });

    return next;
  }

  async publishSubmission(id: string, admin: WorkshopUser, editedContent?: EditableWorkshopContent) {
    ensureAdmin(admin);
    const submission = await this.requireSubmission(id);
    ensureTransition(submission, ["pending_admin_review"]);

    let publishable = submission;
    if (editedContent && Object.keys(editedContent).length > 0) {
      const nextContent = {
        title: editedContent.title ?? submission.title,
        roleName: editedContent.roleName ?? submission.roleName,
        brandId: submission.brandId,
        regionId: submission.regionId,
        dealerId: submission.dealerId,
        storeId: submission.storeId,
        storeName: submission.storeName,
        serviceScenario:
          editedContent.serviceScenario === undefined ? submission.serviceScenario : editedContent.serviceScenario,
        principleRef: editedContent.principleRef === undefined ? submission.principleRef : editedContent.principleRef,
        doText: editedContent.doText ?? submission.doText,
        howText: editedContent.howText === undefined ? submission.howText : editedContent.howText,
        dontText: editedContent.dontText ?? submission.dontText,
      };

      validateDraftInput(nextContent);
      publishable = await this.repository.updateSubmission(id, editedContent);
      await this.repository.addReviewEvent({
        submissionId: id,
        actorId: admin.id,
        eventType: "admin_edit",
        fromStatus: submission.status,
        toStatus: submission.status,
        comment: "Edited before publish.",
        snapshot: editedContent,
      });
    }

    const guide = await this.repository.createPublishedGuide(publishable);
    const published = await this.repository.updateSubmission(id, {
      status: "published",
      publishedGuideId: guide.id,
      lastReviewedAt: new Date(),
    });

    await this.repository.incrementContributionStat(
      {
        id: publishable.submitterId,
        displayName: publishable.submitterName,
        role: "normal_user",
        scope: admin.scope,
      },
      publishable,
    );

    await this.repository.addReviewEvent({
      submissionId: id,
      actorId: admin.id,
      eventType: "admin_publish",
      fromStatus: publishable.status,
      toStatus: "published",
      comment: null,
      snapshot: published,
    });

    return guide;
  }

  async listPublishedGuides(scope: WorkshopUser["scope"], filters = {}) {
    return this.repository.listPublishedGuides(scope, filters);
  }

  async getContributionLeaderboard(scope: WorkshopUser["scope"]) {
    return this.repository.getContributionLeaderboard(scope);
  }

  private async requireSubmission(id: string) {
    const submission = await this.repository.findSubmissionById(id);
    if (!submission) {
      throw new AppError("not_found", `Workshop submission ${id} was not found.`, 404);
    }

    return submission;
  }
}

export function createWorkshopService(repository: WorkshopRepository) {
  return new WorkshopService(repository);
}
