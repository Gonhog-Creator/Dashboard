import { Widget } from "@/components/layout/Widget";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { MsftConnect } from "@/components/settings/MsftConnect";
import { getAllSettings } from "@/lib/settings";
import { authEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getAllSettings();
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Widget title="Configuration">
        <SettingsForm initial={settings} authEnabled={authEnabled} />
      </Widget>
      <Widget title="Microsoft To Do">
        <MsftConnect />
      </Widget>
    </div>
  );
}
