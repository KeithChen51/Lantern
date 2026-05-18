import { Suspense } from "react";
import { WorkshopClient } from "./WorkshopClient";

export default function WorkshopPage() {
  return (
    <Suspense fallback={null}>
      <WorkshopClient />
    </Suspense>
  );
}
