import { body } from "@/modules/auth/access-http";
import { AppError } from "@/shared/errors";
import { boardActor, requireFeedbackRequest, revalidateFeedbackWrite } from "./board-access";
import { feedbackBoard } from "./board-service";
import { readSuggestionComment, readSuggestionCreate, readSuggestionQuery, readSuggestionUpdate } from "./board-validation";

const PRIVATE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
function json(data: unknown, status = 200): Response { return Response.json({ data }, { status, headers: PRIVATE }); }
export function feedbackError(error: unknown): Response {
  return Response.json({ error: { code: error instanceof AppError ? error.code : "unavailable", message: error instanceof AppError ? error.message : "建议板块暂时不可用，请稍后重试。" } }, {
    status: error instanceof AppError ? error.status : 503, headers: PRIVATE,
  });
}
function id(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new AppError("bad_request", "建议或记录编号无效。", 400);
  return value;
}
async function input(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new AppError("bad_request", "请使用 JSON 提交纯文本内容。", 400);
  return body(request);
}
function cursor(request: Request): string | undefined {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== "cursor") || params.getAll("cursor").length > 1) throw new AppError("bad_request", "分页参数无效。", 400);
  return params.has("cursor") ? id(params.get("cursor")) : undefined;
}
export async function listSuggestions(request: Request): Promise<Response> {
  try {
    const principal = await requireFeedbackRequest(request);
    return json(await feedbackBoard.list(boardActor(principal), readSuggestionQuery(new URL(request.url).searchParams)));
  } catch (error) { return feedbackError(error); }
}
export async function createSuggestion(request: Request): Promise<Response> {
  try {
    const before = await requireFeedbackRequest(request, { write: true });
    const draft = readSuggestionCreate(await input(request));
    const principal = await revalidateFeedbackWrite(request, before);
    return json(await feedbackBoard.create(boardActor(principal), draft), 201);
  } catch (error) { return feedbackError(error); }
}
export async function getSuggestion(request: Request, suggestionId: string): Promise<Response> {
  try {
    const principal = await requireFeedbackRequest(request);
    return json(await feedbackBoard.detail(boardActor(principal), id(suggestionId)));
  } catch (error) { return feedbackError(error); }
}
export async function updateSuggestion(request: Request, suggestionId: string): Promise<Response> {
  try {
    const before = await requireFeedbackRequest(request, { manage: true, write: true });
    const draft = readSuggestionUpdate(await input(request));
    const principal = await revalidateFeedbackWrite(request, before, true);
    return json(await feedbackBoard.update(boardActor(principal), id(suggestionId), draft));
  } catch (error) { return feedbackError(error); }
}
export async function setSuggestionLike(request: Request, suggestionId: string): Promise<Response> {
  try {
    const before = await requireFeedbackRequest(request, { write: true });
    const payload = await input(request);
    if (typeof payload.liked !== "boolean" || Object.keys(payload).some(key => key !== "liked")) throw new AppError("bad_request", "点赞参数无效。", 400);
    const principal = await revalidateFeedbackWrite(request, before);
    return json(await feedbackBoard.setLike(boardActor(principal), id(suggestionId), payload.liked));
  } catch (error) { return feedbackError(error); }
}
export async function listSuggestionComments(request: Request, suggestionId: string): Promise<Response> {
  try {
    const principal = await requireFeedbackRequest(request);
    return json(await feedbackBoard.comments(boardActor(principal), id(suggestionId), cursor(request)));
  } catch (error) { return feedbackError(error); }
}
export async function createSuggestionComment(request: Request, suggestionId: string): Promise<Response> {
  try {
    const before = await requireFeedbackRequest(request, { write: true });
    const draft = readSuggestionComment(await input(request));
    const principal = await revalidateFeedbackWrite(request, before);
    return json(await feedbackBoard.comment(boardActor(principal), id(suggestionId), draft), 201);
  } catch (error) { return feedbackError(error); }
}
export async function hideSuggestionComment(request: Request, suggestionId: string, commentId: string): Promise<Response> {
  try {
    const principal = await requireFeedbackRequest(request, { manage: true, write: true });
    await feedbackBoard.hideComment(boardActor(principal), id(suggestionId), id(commentId));
    return json({ hidden: true });
  } catch (error) { return feedbackError(error); }
}
export async function listFeedbackNotifications(request: Request): Promise<Response> {
  try {
    const principal = await requireFeedbackRequest(request);
    return json(await feedbackBoard.notifications(boardActor(principal), cursor(request)));
  } catch (error) { return feedbackError(error); }
}
export async function readFeedbackNotifications(request: Request): Promise<Response> {
  try {
    const before = await requireFeedbackRequest(request, { write: true });
    const payload = await input(request);
    if (Object.keys(payload).some(key => key !== "ids") || !Array.isArray(payload.ids) || !payload.ids.length || payload.ids.length > 50) throw new AppError("bad_request", "请选择需要标记的通知。", 400);
    const ids = [...new Set(payload.ids.map(id))];
    const principal = await revalidateFeedbackWrite(request, before);
    await feedbackBoard.markNotificationsRead(boardActor(principal), ids);
    return json({ updated: true });
  } catch (error) { return feedbackError(error); }
}
