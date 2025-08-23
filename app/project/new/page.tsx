"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Editor from "@monaco-editor/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export default function NewProjectPage() {
  const router = useRouter();
  const createProject = useMutation(api.projects.createProject);
  const addPackage = useMutation(api.projects.addProjectPackage);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [packages, setPackages] = useState<
    Array<{ id: string; name: string; content: string }>
  >([
    {
      id: crypto.randomUUID(),
      name: "periphery-frontend",
      content: defaultPackageJson,
    },
  ]);
  const [activeId, setActiveId] = useState<string | undefined>(packages[0]?.id);
  const [step, setStep] = useState<"details" | "packages">("details");

  const isValidAll = useMemo(() => {
    if (!name.trim()) return false;
    return packages.every((p) => {
      try {
        JSON.parse(p.content);
        return true;
      } catch {
        return false;
      }
    });
  }, [name, packages]);

  const addNewPackage = () => {
    const id = crypto.randomUUID();
    setPackages((prev) => [
      ...prev,
      {
        id,
        name: `package-${prev.length + 1}`,
        content: defaultPackageJson,
      },
    ]);
    setActiveId(id);
  };

  const removePackage = (id: string) => {
    setPackages((prev) => {
      const remaining = prev.filter((p) => p.id !== id);
      if (id === activeId) {
        setActiveId(remaining[0]?.id);
      }
      return remaining;
    });
  };

  const save = async () => {
    if (!isValidAll || !packages[0]) {
      toast.error("Name required and at least one valid package.json");
      return;
    }
    try {
      const primary = packages[0];
      const projectId = await createProject({
        name,
        description,
        packageJson: primary.content,
        packageName: primary.name,
      });
      // add the rest
      const rest = packages.slice(1);
      for (const p of rest) {
        await addPackage({ projectId, name: p.name, content: p.content });
      }
      toast.success("Project created");
      router.push(`/project/${projectId}`);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to create project";
      toast.error(message);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">New project</h1>
          <p className="text-sm text-muted-foreground">
            Enter basic details and add one or more package.json files.
          </p>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => setStep("details")}
              data-active={step === "details"}
            >
              <span
                className={step === "details" ? "font-medium" : "opacity-70"}
              >
                1. Details
              </span>
            </Button>
            <span>→</span>
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => setStep("packages")}
              data-active={step === "packages"}
            >
              <span
                className={step === "packages" ? "font-medium" : "opacity-70"}
              >
                2. Packages
              </span>
            </Button>
          </div>
        </div>
        {step === "packages" && null}
      </div>

      {step === "details" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My project"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep("packages")} disabled={!name.trim()}>
              Next
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm font-medium">Add your package.json files</div>
          {packages.length === 0 ? (
            <div className="border rounded-md p-6 text-sm text-muted-foreground flex items-center justify-between">
              <span>
                No packages yet. Add your first package.json to continue.
              </span>
              <Button size="sm" onClick={addNewPackage}>
                Add package.json
              </Button>
            </div>
          ) : (
            <Tabs value={activeId} onValueChange={(v) => setActiveId(v)}>
              <div className="flex items-center gap-2 flex-wrap">
                <TabsList className="flex flex-wrap gap-2">
                  {packages.map((p) => (
                    <TabsTrigger key={p.id} value={p.id}>
                      {p.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addNewPackage}
                  className="ml-auto"
                >
                  <Plus className="h-4 w-4 mr-1" /> Add package.json
                </Button>
              </div>
              {packages.map((p) => (
                <TabsContent key={p.id} value={p.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={p.name}
                      onChange={(e) =>
                        setPackages((prev) =>
                          prev.map((x) =>
                            x.id === p.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                      className="max-w-xs"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => removePackage(p.id)}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="h-80 border rounded-md overflow-hidden">
                    <Editor
                      height="100%"
                      defaultLanguage="json"
                      value={p.content}
                      onChange={(v) =>
                        setPackages((prev) =>
                          prev.map((x) =>
                            x.id === p.id ? { ...x, content: v ?? "" } : x,
                          ),
                        )
                      }
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        automaticLayout: true,
                      }}
                    />
                  </div>
                  <div className="text-xs">
                    {(() => {
                      try {
                        JSON.parse(p.content);
                        return (
                          <span className="text-green-600">Valid JSON</span>
                        );
                      } catch {
                        return (
                          <span className="text-red-600">Invalid JSON</span>
                        );
                      }
                    })()}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep("details")}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push("/")}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!isValidAll}>
                Create project
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const defaultPackageJson = `{
  "name": "example",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^19.0.0",
    "next": "^15.2.3"
  }
}`;
