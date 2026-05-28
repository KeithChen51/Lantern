import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { authRepository, createAuthService } from "@/modules/auth";
import { createTenantService, tenantRepository } from "@/modules/tenant";
import {
  createWorkshopService,
  workshopRepository,
  type CreateWorkshopDraftInput,
  type EditableWorkshopContent,
  type WorkshopUser,
} from "@/modules/workshop";
import { AppError, toErrorResponse } from "@/shared/errors";
import { optionalString, requireString } from "@/shared/validation";
import { getWorkshopUnavailableMessage } from "./workshop-errors";

const authService = createAuthService(authRepository);
const tenantService = createTenantService(tenantRepository);
export const workshopService = createWorkshopService(workshopRepository);

function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new AppError("bad_request", getWorkshopUnavailableMessage(), 503);
  }
}

export async function getCurrentWorkshopUser(): Promise<WorkshopUser> {
  assertDatabaseConfigured();
  const requestHeaders = await headers();
  const user = await authService.getCurrentUser({ headers: requestHeaders });
  const scope = await tenantService.getUserOrgScope(user.id);

  return {
    id: user.id,
    displayName: user.displayName,
    role: scope.role,
    scope,
  };
}

export async function getCurrentWorkshopAdmin(): Promise<WorkshopUser> {
  assertDatabaseConfigured();
  const requestHeaders = await headers();
  const user = await authService.getCurrentAdmin({ headers: requestHeaders });
  const scope = await tenantService.getUserOrgScope(user.id);

  return {
    id: user.id,
    displayName: user.displayName,
    role: "highest_admin",
    scope,
  };
}

export async function readDraftInput(request: Request, user: WorkshopUser): Promise<CreateWorkshopDraftInput> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  return {
    title: requireString(body.title, "title"),
    roleName: requireString(body.roleName, "roleName"),
    brandId: optionalString(body.brandId) ?? user.scope.brandId,
    regionId: optionalString(body.regionId) ?? user.scope.regionId,
    dealerId: optionalString(body.dealerId) ?? user.scope.dealerId,
    storeId: optionalString(body.storeId) ?? user.scope.storeId,
    storeName: optionalString(body.storeName),
    serviceScenario: optionalString(body.serviceScenario),
    principleRef: optionalString(body.principleRef),
    doText: optionalString(body.doText) ?? "",
    howText: optionalString(body.howText),
    dontText: optionalString(body.dontText) ?? "",
  };
}

export async function readEditableContent(request: Request): Promise<EditableWorkshopContent> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const readRequiredPatchString = (fieldName: string) => {
    if (!(fieldName in body)) return undefined;
    return typeof body[fieldName] === "string" ? body[fieldName].trim() : "";
  };
  const readOptionalPatchString = (fieldName: string) => {
    if (!(fieldName in body)) return undefined;
    return optionalString(body[fieldName]);
  };

  return {
    title: readRequiredPatchString("title"),
    roleName: readRequiredPatchString("roleName"),
    serviceScenario: readOptionalPatchString("serviceScenario"),
    principleRef: readOptionalPatchString("principleRef"),
    doText: readRequiredPatchString("doText"),
    howText: readOptionalPatchString("howText"),
    dontText: readRequiredPatchString("dontText"),
  };
}

export function jsonData<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function jsonError(error: unknown) {
  const response = toErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}
