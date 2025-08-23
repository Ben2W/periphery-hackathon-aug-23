"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function RelevantDependenciesPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId as any;
  const deps = useQuery(api.projects.listRelevantDependencies, {
    projectId,
  });
  const project = useQuery(api.projects.getProject, { id: projectId });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Relevant dependencies</h1>
        {project && (
          <p className="text-sm text-muted-foreground mt-1">
            Project: {project.name}
          </p>
        )}
      </div>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Package</th>
              <th className="text-left p-3 font-medium">Version</th>
              <th className="text-left p-3 font-medium">GitHub</th>
              <th className="text-left p-3 font-medium">Importance</th>
            </tr>
          </thead>
          <tbody>
            {deps?.map((d) => (
              <tr key={d._id} className="border-t">
                <td className="p-3">{d.packageName}</td>
                <td className="p-3 text-muted-foreground">{d.versionSpec}</td>
                <td className="p-3">
                  {d.githubUrl ? (
                    <a
                      className="text-blue-600 hover:underline"
                      href={d.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.githubUrl}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3">
                  {typeof d.importanceScore === "number" ? (
                    d.importanceScore.toFixed(2)
                  ) : (
                    <span className="text-muted-foreground">Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
