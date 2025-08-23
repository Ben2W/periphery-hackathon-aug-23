import { api } from "@/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import type { Id } from "@/convex/_generated/dataModel";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await fetchQuery(api.projects.getProject, {
    id: projectId as Id<"projects">,
  });

  if (!project) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Project not found</h1>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      <p className="text-sm text-muted-foreground">{project.description}</p>
      <div className="mt-6 opacity-70 text-sm">(todo)</div>
    </div>
  );
}
