import { ChatPanel } from "@/components/hermit/ChatPanel";
import { HermitIdentity } from "@/components/hermit/HermitIdentity";
import { PageHeading } from "@/components/ui/PageHeading";
import styles from "@/components/hermit/hermit-v3.module.css";

export default function HermitPage() {
  return (
    <div
      className={styles.page}
      data-lh-hermit-page
      data-lh-page="hermit"
      data-lh-page-archetype="tool-workspace"
    >
      <header className={styles.pageHeader} data-lh-hermit-intro>
        <PageHeading
          title="路引"
          description="汽车售后服务文化助手 · 从现场问题，找到行动方向"
          titleAdornment={<HermitIdentity />}
        />
      </header>
      <div className={styles.chatFrame} data-lh-hermit-chat-frame>
        <ChatPanel />
      </div>
    </div>
  );
}
