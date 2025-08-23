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
  const cutoff = useQuery(api.projects.getSignalCutoff, {});

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
      {typeof cutoff === "number" && (
        <div className="text-sm text-muted-foreground">
          Signal cutoff: {cutoff.toFixed(2)} (relevance × niche)
        </div>
      )}
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Package</th>
              <th className="text-left p-3 font-medium">Version</th>
              <th className="text-left p-3 font-medium">GitHub</th>
              <th className="text-left p-3 font-medium">Relevance</th>
              <th className="text-left p-3 font-medium">Niche</th>
              <th className="text-left p-3 font-medium">Signal</th>
            </tr>
          </thead>
          <tbody>
            {deps?.map((d) => {
              const disabled = !d.githubUrl;
              const passed =
                typeof cutoff === "number" &&
                typeof d.signalScore === "number" &&
                d.signalScore >= cutoff;
              return (
                <tr
                  key={d._id}
                  className={`border-t ${disabled ? "opacity-50" : ""} ${
                    passed ? "bg-green-50 dark:bg-green-950/30" : ""
                  }`}
                >
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
                    {typeof d.importanceScore === "number"
                      ? d.importanceScore.toFixed(2)
                      : "—"}
                  </td>
                  <td className="p-3">
                    {typeof d.nicheScore === "number"
                      ? d.nicheScore.toFixed(2)
                      : "—"}
                  </td>
                  <td className="p-3">
                    {typeof d.signalScore === "number"
                      ? d.signalScore.toFixed(2)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
