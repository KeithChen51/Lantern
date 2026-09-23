import { config } from "dotenv";
// Load the same local configuration as Next without polluting MCP stdout.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
