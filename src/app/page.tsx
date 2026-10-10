// Route configuration is not inherited from the re-exported Heart page.
// Read published knowledge at request time, not from the build container.
export const dynamic = "force-dynamic";

export { default } from "./heart/page";
