import { ChatPanel } from "@/components/hermit/ChatPanel";
import { headers } from "next/headers";
import { requireSiteVisitor } from "@/modules/auth/access";
import styles from "@/components/hermit/hermit-v3.module.css";
import { resolveCaseEntry } from "./case-entry";

export default async function HermitPage({ searchParams }: { searchParams: Promise<{ from?: string | string[]; question?: string | string[] }> }) {
  const [params, principal] = await Promise.all([searchParams, headers().then(requireSiteVisitor)]);
  const entry = await resolveCaseEntry(params, principal);
  return (
    <div
      className={styles.page}
      data-lh-hermit-page
      data-lh-page="hermit"
      data-lh-page-archetype="tool-workspace"
    >
      <div className={styles.chatFrame} data-lh-hermit-chat-frame>
        <ChatPanel entry={entry} />
      </div>
    </div>
  );
}
