export type AppRole = "normal_user" | "highest_admin";
export type ScopeType = "global" | "brand" | "region" | "dealer" | "store";

export type TenantUserRoleRecord = {
  role: AppRole;
  scopeType: ScopeType;
  scopeId: string | null;
};

export type TenantUserRecord = {
  id: string;
  displayName: string;
  primaryBrandId: string | null;
  primaryRegionId: string | null;
  primaryDealerId: string | null;
  primaryStoreId: string | null;
  roles: TenantUserRoleRecord[];
};

export type OrgScope = {
  userId: string;
  role: AppRole;
  scopeType: ScopeType;
  brandId: string | null;
  regionId: string | null;
  dealerId: string | null;
  storeId: string | null;
};

export type OrgWhere = {
  brandId?: string;
  regionId?: string;
  dealerId?: string;
  storeId?: string;
};

export interface TenantRepository {
  findUserById(userId: string): Promise<TenantUserRecord | null>;
}
