import { LhOperationalPageHeader, LhPanel } from "@/components/ui/lighthouse-primitives";
import { FeedbackForm } from "./FeedbackForm";

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
    <div data-lh-feedback-page className="mx-auto max-w-[760px]">
      <LhOperationalPageHeader
        title="意见反馈"
        description="告诉我们哪里不顺、哪里可以更好，我们会记录并跟进。"
      />

      <LhPanel data-lh-feedback-panel className="mt-6 p-5 md:p-7">
        <FeedbackForm initialSourcePath={initialSourcePath} />
      </LhPanel>
    </div>
  );
}
