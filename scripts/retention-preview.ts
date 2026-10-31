import { getRetentionPreview, parseRetentionPreviewArgs } from "../src/modules/analytics/retention-preview";

async function main() {
  const options = parseRetentionPreviewArgs(process.argv.slice(2));
  const { prisma } = await import("../src/infrastructure/db/client");
  try {
    console.log(JSON.stringify(await getRetentionPreview(prisma, options)));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  // Do not print database exceptions, connection strings or caller arguments.
  console.error("Retention preview failed. Verify database access and usage: npm run retention:preview [-- --notice-at ISO_TIMESTAMP_WITH_TIMEZONE]. This command only reads aggregate counts.");
  process.exitCode = 1;
});
