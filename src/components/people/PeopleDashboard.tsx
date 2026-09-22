"use client";

import { useCallback, useState } from "react";
import { Users, LayoutGrid, Share2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DirectoryPanel } from "./DirectoryPanel";
import { GraphPanel } from "./GraphPanel";
import { PersonDetail } from "./PersonDetail";

const TABS = [
  { id: "directory", label: "Directory", icon: LayoutGrid },
  { id: "graph", label: "Graph", icon: Share2 },
];

export function PeopleDashboard() {
  const [tab, setTab] = useState("directory");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="w-full">
      <header className="mb-4 flex items-center gap-3">
        <Users className="size-6 text-primary" />
        <h1 className="text-xl font-semibold">People</h1>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="gap-1.5">
              <Icon className="size-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="directory">
          <DirectoryPanel refreshKey={refreshKey} onSelect={setSelectedId} />
        </TabsContent>
        <TabsContent value="graph">
          <GraphPanel refreshKey={refreshKey} onSelect={setSelectedId} />
        </TabsContent>
      </Tabs>

      <PersonDetail
        personId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={refresh}
        onOpenPerson={setSelectedId}
      />
    </div>
  );
}
