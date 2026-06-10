import { ActionCaseDetailPage } from "../ActionCaseDetailPage";

const CASE_SLUG = "driver-partner-rest-area";

export const dynamic = "force-dynamic";

export default function DriverPartnerRestAreaPage() {
  return <ActionCaseDetailPage slug={CASE_SLUG} />;
}
