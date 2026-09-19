import { ScienceLabs } from "@/components/science/ScienceLabs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Science Labs — Command Center",
};

export default function SciencePage() {
  // Fill the viewport under the layout's padding; the canvas handles the rest.
  return (
    <div className="h-[calc(100vh-3rem)]">
      <ScienceLabs />
    </div>
  );
}
