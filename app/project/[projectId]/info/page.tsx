import { api } from "@/convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import type { Id } from "@/convex/_generated/dataModel";
import ProjectInfoViewer from "@/components/ProjectInfoViewer";

export default async function ProjectInfoPage({
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

  const packages = await fetchQuery(api.projects.listProjectPackages, {
    projectId: project._id,
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-muted-foreground">{project.description}</p>
      </div>

      <div className="space-y-2">
        {packages.length === 0 ? (
          <div className="border rounded-md p-6 text-sm text-muted-foreground flex items-center justify-between">
            <span>No packages yet.</span>
          </div>
        ) : (
          <ProjectInfoViewer
            packages={packages.map((p) => ({
              id: String(p._id),
              name: p.name,
              content: p.content,
            }))}
          />
        )}
      </div>
    </div>
  );
}
