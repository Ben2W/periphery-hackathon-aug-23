"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function RelevantPeoplePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId as any;
  const scrape = useQuery(api.projects.getGithubScrape, { projectId });
  const people = useQuery(api.projects.listGithubInfluence, { projectId });
  const logs = useQuery(api.projects.listGithubLogs, { projectId });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Relevant people</h1>
      {!scrape || !scrape.finishedScrapingGithub ? (
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
      <div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              View logs
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>GitHub scrape logs</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto text-sm space-y-2">
              {logs?.map((l) => (
                <div key={l._id} className="flex gap-2">
                  <span className="text-muted-foreground">
                    {new Date(l._creationTime).toLocaleTimeString()}
                  </span>
                  <span className="uppercase text-xs font-medium">
                    {l.level}
                  </span>
                  {l.step && (
                    <span className="text-xs text-muted-foreground">
                      [{l.step}]
                    </span>
                  )}
                  <span>{l.message}</span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {people?.map((p) => {
          const score = p.commits + p.issues;
          return (
            <Link
              key={p._id}
              href={`/project/${projectId}/githubUser/${p.username}`}
              className="block border rounded-md p-4 hover:bg-muted/50 transition"
            >
              <div className="font-medium flex items-center gap-2">
                <span>{p.username}</span>
                <a
                  href={p.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  (GitHub)
                </a>
              </div>
              <div className="text-sm text-muted-foreground">
                {p.commits} commits • {p.issues} issues • Influence {score}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
