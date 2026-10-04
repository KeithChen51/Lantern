import { LhPanel } from "@/components/ui/lighthouse-primitives";
import { PageHeading } from "@/components/ui/PageHeading";
import { FeedbackForm } from "./FeedbackForm";
import styles from "./feedback.module.css";

type FeedbackPageProps = {
  searchParams: Promise<{ from?: string | string[] }>;
};

function readInitialSourcePath(value: string | string[] | undefined) {
  const sourcePath = Array.isArray(value) ? value[0] : value;
  if (!sourcePath?.startsWith("/")) return "";
  return sourcePath.slice(0, 240);
}

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const params = await searchParams;
  const initialSourcePath = readInitialSourcePath(params.from);

  return (
    <div data-lh-feedback-page className={styles.feedbackPage}>
      <PageHeading title="让灯塔更好用" description="问题、建议或内容纠错，都可以在这里告诉我们。" />

      <div className={styles.feedbackLayout}>
        <LhPanel data-lh-feedback-panel className={styles.feedbackPanel}>
          <FeedbackForm initialSourcePath={initialSourcePath} />
        </LhPanel>
        <aside className={styles.feedbackNote}>
          <h2>提交说明</h2>
          <p>反馈将进入内部问题列表。请勿填写客户个人信息、账号、密钥等敏感信息。</p>
        </aside>
      </div>
    </div>
  );
}
