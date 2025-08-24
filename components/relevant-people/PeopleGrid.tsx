"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export type Person = {
  username: string;
  htmlUrl?: string;
  totalCommits: number;
  totalIssues: number;
  breakdown: Array<{
    owner: string;
    repo: string;
    packageName: string;
    commits: number;
    issues: number;
  }>;
};

export function PeopleGrid({
  projectId,
  people,
}: {
  projectId: string;
  people: Array<Person> | undefined;
}) {
  if (!people) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border rounded-md p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-3 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-24 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {people
        .filter((p) => !p.username.endsWith("[bot]"))
        .map((p) => {
          const score = p.totalCommits + p.totalIssues;
          return (
            <Link
              key={p.username}
              href={`/project/${projectId}/githubUser/${p.username}`}
              className="block border rounded-md p-4 hover:bg-muted/50 transition"
            >
              <div className="font-medium flex items-center gap-2">
                <span>{p.username}</span>
                {p.htmlUrl && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        window.open(
                          p.htmlUrl!,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      } catch {}
                    }}
                  >
                    (GitHub)
                  </button>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {p.totalCommits} commits • {p.totalIssues} issues • Influence{" "}
                {score}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.breakdown.map((b) => (
                  <Badge key={`${b.owner}/${b.repo}`} variant="secondary">
                    {b.packageName}: {b.commits}
                  </Badge>
                ))}
              </div>
            </Link>
          );
        })}
    </div>
  );
}
