"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Editor from "@monaco-editor/react";

type PackageView = {
  id: string;
  name: string;
  content: string;
};

export default function ProjectInfoViewer({
  packages,
}: {
  packages: Array<PackageView>;
}) {
  const [activeId, setActiveId] = useState<string | undefined>(packages[0]?.id);

  if (packages.length === 0) return null;

  return (
    <Tabs value={activeId} onValueChange={(v) => setActiveId(v)}>
      <div className="flex items-center gap-2 flex-wrap">
        <TabsList className="flex flex-wrap gap-2">
          {packages.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {packages.map((p) => (
        <TabsContent key={p.id} value={p.id} className="space-y-2">
          <div className="h-80 border rounded-md overflow-hidden">
            <Editor
              height="100%"
              defaultLanguage="json"
              value={p.content}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                automaticLayout: true,
              }}
            />
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
