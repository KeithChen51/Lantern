import { ChatPanel } from "@/components/hermit/ChatPanel";
import styles from "@/components/hermit/hermit-v3.module.css";

export default function HermitPage() {
  return (
    <div
      className={styles.page}
      data-lh-hermit-page
      data-lh-page="hermit"
      data-lh-page-archetype="tool-workspace"
    >
      <div className={styles.chatFrame} data-lh-hermit-chat-frame>
        <ChatPanel />
      </div>
    </div>
  );
}
