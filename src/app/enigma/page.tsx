import { EnigmaTab } from "@/components/enigma/EnigmaTab";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Enigma Lab — Command Center",
};

export default function EnigmaPage() {
  return (
    <div className="h-[calc(100vh-3rem)]">
      <EnigmaTab />
    </div>
  );
}
