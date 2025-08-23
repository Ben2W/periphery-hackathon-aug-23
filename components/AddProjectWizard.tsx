"use client";

import { useState, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";

export default function AddProjectWizard() {
  const createProject = useMutation(api.projects.createProject);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"details" | "package">("details");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [packageJson, setPackageJson] = useState(defaultPackageJson);
  const isValidJson = useMemo(() => {
    try {
      JSON.parse(packageJson);
      return true;
    } catch {
      return false;
    }
  }, [packageJson]);

  const onSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!isValidJson) {
      toast.error("package.json must be valid JSON");
      return;
    }
    try {
      await createProject({ name, description, packageJson });
      toast.success("Project created");
      setOpen(false);
      setStep("details");
      setName("");
      setDescription("");
      setPackageJson(defaultPackageJson);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to create project";
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add project</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add new project</DialogTitle>
        </DialogHeader>
        <Tabs value={step} onValueChange={(v) => setStep(v as typeof step)}>
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="package">package.json</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="flex flex-col gap-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My project"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep("package")}>Next</Button>
            </div>
          </TabsContent>
          <TabsContent value="package" className="flex flex-col gap-4 pt-4">
            <div className="h-72 border rounded-md overflow-hidden">
              <Editor
                height="100%"
                defaultLanguage="json"
                value={packageJson}
                onChange={(v) => setPackageJson(v ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  automaticLayout: true,
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div
                className={`text-xs ${isValidJson ? "text-green-600" : "text-red-600"}`}
              >
                {isValidJson ? "Valid JSON" : "Invalid JSON"}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep("details")}>
                  Back
                </Button>
                <Button
                  onClick={onSubmit}
                  disabled={!isValidJson || !name.trim()}
                >
                  Create
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
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
