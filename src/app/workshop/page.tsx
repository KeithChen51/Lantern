import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isPublicWorkshopEnabled } from "@/config/features";
import { WorkshopClient } from "./WorkshopClient";

export default function WorkshopPage() {
  if (!isPublicWorkshopEnabled()) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <WorkshopClient />
    </Suspense>
  );
}
