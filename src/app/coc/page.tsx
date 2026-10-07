import { Suspense } from "react";
import { CocDashboard } from "@/components/coc/CocDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Clash of Clans — Command Center",
};

export default function CocPage() {
  return (
    <div className="coc-theme">
      {/* Suspense required: CocDashboard reads useSearchParams (?tab, ?member) */}
      <Suspense>
        <CocDashboard />
      </Suspense>
    </div>
  );
}
