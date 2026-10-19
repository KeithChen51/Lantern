import { readFileSync } from "node:fs";
import { readSiteAccessConfig } from "../src/modules/auth/site-access-config";

/** Check the exact resolved app environment, without inheriting tools-image defaults. */
export function checkResolvedAccessConfig(input: unknown, service: string, expectedDeployment: "test" | "production" = "test"): void {
  const services = (input as { services?: Record<string, { environment?: unknown }> } | null)?.services;
  const environment = services?.[service]?.environment;
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) throw new Error("Missing app environment");
  const env: NodeJS.ProcessEnv = Object.create(null);
  for (const [key, value] of Object.entries(environment)) {
    if (value !== null && typeof value !== "string") throw new Error("Invalid resolved environment");
    env[key] = value === null ? undefined : value;
  }
  // Both deployed environments use production builds; HTTP is only an exact
  // test-origin exception. Never inherit tools-image defaults.
  if (env.NODE_ENV !== "production" || env.LIGHTHOUSE_DEPLOYMENT_ENV !== expectedDeployment || env.AUTH_ALLOW_LOCAL_HTTP !== "false") throw new Error("Unexpected deployment");
  readSiteAccessConfig(env);
}

if (/(?:^|[\\/])check-access-config\.(?:ts|cjs)$/.test(process.argv[1] ?? "")) {
  try {
    if (process.argv.length < 3 || process.argv.length > 4) throw new Error("Expected app service and optional deployment");
    const deployment = process.argv[3] ?? "test";
    if (deployment !== "test" && deployment !== "production") throw new Error("Unexpected deployment");
    checkResolvedAccessConfig(JSON.parse(readFileSync(0, "utf8")), process.argv[2], deployment);
    console.log("Resolved authentication configuration verified.");
  } catch {
    // Compose JSON contains secrets: never print input, values or exceptions.
    console.error("Resolved authentication configuration refused; check the private app configuration.");
    process.exitCode = 1;
  }
}
