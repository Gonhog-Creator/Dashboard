import { Widget } from "@/components/layout/Widget";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { MsftConnect } from "@/components/settings/MsftConnect";
import { CocConnect } from "@/components/settings/CocConnect";
import { GoogleAccount } from "@/components/settings/GoogleAccount";
import { EnvEditor } from "@/components/settings/EnvEditor";
import { getAllSettings } from "@/lib/settings";
import { authEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getAllSettings();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Configuration">
          <SettingsForm initial={settings} authEnabled={authEnabled} />
        </Widget>
        <Widget title="Clash of Clans">
          <CocConnect initial={settings} />
        </Widget>
        <Widget title="Google Account">
          <GoogleAccount />
        </Widget>
        <Widget title="Microsoft To Do">
          <MsftConnect />
        </Widget>
        <Widget title="Environment (.env)" className="lg:col-span-2">
          <EnvEditor />
        </Widget>
      </div>
    </div>
  );
}
