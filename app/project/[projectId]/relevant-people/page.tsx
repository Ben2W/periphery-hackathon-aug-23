"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import * as React from "react";
import { LogsDialog } from "@/components/relevant-people/LogsDialog";
// filters removed
import { PeopleGrid } from "@/components/relevant-people/PeopleGrid";

export default function RelevantPeoplePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId as any;
  const scrape = useQuery(api.projects.getGithubScrape, { projectId });
  const data = useQuery(api.projects.listGithubInfluenceWithRepos, {
    projectId,
  });
  const logs = useQuery(api.projects.listGithubLogs, { projectId });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Relevant people</h1>
      {scrape === null || !scrape?.finishedScrapingGithub ? (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            <span>
              Scraping GitHub…
              {typeof scrape?.percent === "number" && ` ${scrape.percent}%`}
            </span>
          </div>
          <div className="w-full h-2 bg-muted rounded">
            <div
              className="h-2 bg-primary rounded"
              style={{ width: `${scrape?.percent ?? 0}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {scrape?.processedRepos ?? 0} / {scrape?.totalRepos ?? 0} repos
          </div>
        </div>
      ) : null}
      <LogsDialog logs={logs} />

      {/* Repo filters removed per request */}

      <PeopleGrid projectId={projectId} people={data?.people} />
    </div>
  );
}
