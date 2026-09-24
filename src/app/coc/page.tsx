import { CocDashboard } from "@/components/coc/CocDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Clash of Clans — Command Center",
};

export default function CocPage() {
  return (
    <div className="coc-theme">
      <CocDashboard />
    </div>
  );
}
