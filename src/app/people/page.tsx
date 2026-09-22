import { PeopleDashboard } from "@/components/people/PeopleDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "People — Command Center",
};

export default function PeoplePage() {
  return <PeopleDashboard />;
}
