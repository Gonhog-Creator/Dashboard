import { FinanceDashboard } from "@/components/finance/FinanceDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Finance — Command Center",
};

export default function FinancePage() {
  return <FinanceDashboard />;
}
