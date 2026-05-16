import {
  AppRole,
  PrismaClient,
  RecordStatus,
  ScopeType,
  UserType,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const brand = await prisma.brand.upsert({
    where: { code: "demo-brand" },
    update: { name: "Demo Brand", status: RecordStatus.ACTIVE },
    create: {
      id: "brand-demo",
      code: "demo-brand",
      name: "Demo Brand",
      status: RecordStatus.ACTIVE,
    },
  });

  const region = await prisma.region.upsert({
    where: { brandId_code: { brandId: brand.id, code: "east" } },
    update: { name: "East Region", status: RecordStatus.ACTIVE },
    create: {
      id: "region-east",
      brandId: brand.id,
      code: "east",
      name: "East Region",
      status: RecordStatus.ACTIVE,
    },
  });

  const dealer = await prisma.dealer.upsert({
    where: { brandId_code: { brandId: brand.id, code: "demo-dealer" } },
    update: { name: "Demo Dealer", regionId: region.id, status: RecordStatus.ACTIVE },
    create: {
      id: "dealer-demo",
      brandId: brand.id,
      regionId: region.id,
      code: "demo-dealer",
      name: "Demo Dealer",
      status: RecordStatus.ACTIVE,
    },
  });

  const store = await prisma.store.upsert({
    where: { brandId_code: { brandId: brand.id, code: "xinghe" } },
    update: {
      name: "星河店",
      regionId: region.id,
      dealerId: dealer.id,
      city: "上海",
      status: RecordStatus.ACTIVE,
    },
    create: {
      id: "store-xinghe",
      brandId: brand.id,
      regionId: region.id,
      dealerId: dealer.id,
      code: "xinghe",
      name: "星河店",
      city: "上海",
      status: RecordStatus.ACTIVE,
    },
  });

  const normalUser = await prisma.user.upsert({
    where: { id: "user-demo" },
    update: {
      displayName: "李明",
      userType: UserType.DEALER_USER,
      primaryBrandId: brand.id,
      primaryRegionId: region.id,
      primaryDealerId: dealer.id,
      primaryStoreId: store.id,
      primaryRoleName: "服务顾问",
      status: RecordStatus.ACTIVE,
    },
    create: {
      id: "user-demo",
      displayName: "李明",
      userType: UserType.DEALER_USER,
      primaryBrandId: brand.id,
      primaryRegionId: region.id,
      primaryDealerId: dealer.id,
      primaryStoreId: store.id,
      primaryRoleName: "服务顾问",
      status: RecordStatus.ACTIVE,
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { id: "admin-demo" },
    update: {
      displayName: "品牌方管理员",
      userType: UserType.INTERNAL_EMPLOYEE,
      primaryBrandId: brand.id,
      primaryRegionId: null,
      primaryDealerId: null,
      primaryStoreId: null,
      primaryRoleName: "最高管理员",
      status: RecordStatus.ACTIVE,
    },
    create: {
      id: "admin-demo",
      displayName: "品牌方管理员",
      userType: UserType.INTERNAL_EMPLOYEE,
      primaryBrandId: brand.id,
      primaryRoleName: "最高管理员",
      status: RecordStatus.ACTIVE,
    },
  });

  await prisma.userOrgMembership.upsert({
    where: { id: "membership-demo-user" },
    update: {
      brandId: brand.id,
      regionId: region.id,
      dealerId: dealer.id,
      storeId: store.id,
      roleName: "服务顾问",
      isPrimary: true,
      status: RecordStatus.ACTIVE,
    },
    create: {
      id: "membership-demo-user",
      userId: normalUser.id,
      brandId: brand.id,
      regionId: region.id,
      dealerId: dealer.id,
      storeId: store.id,
      roleName: "服务顾问",
      isPrimary: true,
      status: RecordStatus.ACTIVE,
    },
  });

  await prisma.userOrgMembership.upsert({
    where: { id: "membership-demo-admin" },
    update: {
      brandId: brand.id,
      roleName: "最高管理员",
      isPrimary: true,
      status: RecordStatus.ACTIVE,
    },
    create: {
      id: "membership-demo-admin",
      userId: adminUser.id,
      brandId: brand.id,
      roleName: "最高管理员",
      isPrimary: true,
      status: RecordStatus.ACTIVE,
    },
  });

  await prisma.userRole.upsert({
    where: { id: "role-demo-user" },
    update: {
      role: AppRole.NORMAL_USER,
      scopeType: ScopeType.STORE,
      scopeId: store.id,
    },
    create: {
      id: "role-demo-user",
      userId: normalUser.id,
      role: AppRole.NORMAL_USER,
      scopeType: ScopeType.STORE,
      scopeId: store.id,
    },
  });

  await prisma.userRole.upsert({
    where: { id: "role-demo-admin" },
    update: {
      role: AppRole.HIGHEST_ADMIN,
      scopeType: ScopeType.BRAND,
      scopeId: brand.id,
    },
    create: {
      id: "role-demo-admin",
      userId: adminUser.id,
      role: AppRole.HIGHEST_ADMIN,
      scopeType: ScopeType.BRAND,
      scopeId: brand.id,
    },
  });

  await prisma.identityAccount.upsert({
    where: { provider_providerUserId: { provider: "oa", providerUserId: "oa-li-ming" } },
    update: { userId: normalUser.id },
    create: {
      id: "identity-oa-li-ming",
      userId: normalUser.id,
      provider: "oa",
      providerUserId: "oa-li-ming",
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
