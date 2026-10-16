import { readFileSync } from "node:fs";
import { readAccessConfig } from "../src/modules/auth/access-config";

/** Check the exact resolved app environment, without inheriting tools-image defaults. */
export function checkResolvedAccessConfig(input: unknown, service: string): void {
  const services = (input as { services?: Record<string, { environment?: unknown }> } | null)?.services;
  const environment = services?.[service]?.environment;
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) throw new Error("Missing app environment");
  const env: NodeJS.ProcessEnv = Object.create(null);
  for (const [key, value] of Object.entries(environment)) {
    if (value !== null && typeof value !== "string") throw new Error("Invalid resolved environment");
    env[key] = value === null ? undefined : value;
  }
  // Existing-test upgrade is a production build deployed as test. Keep these
  // explicit assertions in addition to the app's shared authentication checks.
  if (env.NODE_ENV !== "production" || env.LIGHTHOUSE_DEPLOYMENT_ENV !== "test" || env.AUTH_ALLOW_LOCAL_HTTP !== "false") throw new Error("Unexpected test deployment");
  readAccessConfig(env);
}

if (/(?:^|[\\/])check-access-config\.(?:ts|cjs)$/.test(process.argv[1] ?? "")) {
  try {
    if (process.argv.length !== 3) throw new Error("Expected app service");
    checkResolvedAccessConfig(JSON.parse(readFileSync(0, "utf8")), process.argv[2]);
    console.log("Resolved test authentication configuration verified.");
  } catch {
    // Compose JSON contains secrets: never print input, values or exceptions.
    console.error("Resolved test authentication configuration refused; check the private app configuration.");
    process.exitCode = 1;
  }
}
