"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

export default function GithubUserDetailPage() {
  const params = useParams<{ projectId: string; githubUsername: string }>();
  const projectId = params?.projectId as any;
  const username = params?.githubUsername as string;
  const detail = useQuery(api.projects.getGithubUserDetail, {
    projectId,
    username,
  });

  if (!detail) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span>Loading user influence…</span>
        </div>
      </div>
    );
  }

  const coverage = `${detail.affectedRepos} / ${detail.totalRelevantRepos}`;
  // Try to get avatar URL from detail.htmlUrl if available, fallback to GitHub default avatar
  let avatarUrl: string | undefined = undefined;
  if (detail.htmlUrl) {
    // detail.htmlUrl is like https://github.com/username
    // GitHub avatar is at https://github.com/username.png
    try {
      const url = new URL(detail.htmlUrl);
      avatarUrl = `${url.origin}/${detail.username}.png`;
    } catch {
      avatarUrl = undefined;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-2">
            <Link
              href={`/project/${projectId}/relevant-people`}
              className="text-sm text-primary hover:underline"
            >
              ← Back to relevant people
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt={`${detail.username} avatar`}
                className="w-10 h-10 rounded-full border"
                width={40}
                height={40}
              />
            )}
            <h1 className="text-2xl font-semibold">{detail.username}</h1>
          </div>
          {detail.htmlUrl ? (
            <a
              href={detail.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground hover:underline"
            >
              View on GitHub
            </a>
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">
            Influence coverage
          </div>
          <div className="text-base font-medium">{coverage} dependencies</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border rounded-md p-4">
          <div className="text-sm text-muted-foreground">Total commits</div>
          <div className="text-xl font-semibold">{detail.totalCommits}</div>
        </div>
        <div className="border rounded-md p-4">
          <div className="text-sm text-muted-foreground">Total issues</div>
          <div className="text-xl font-semibold">{detail.totalIssues}</div>
        </div>
        <div className="border rounded-md p-4">
          <div className="text-sm text-muted-foreground">Repos influenced</div>
          <div className="text-xl font-semibold">{detail.affectedRepos}</div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Relevant repositories</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {detail.repos.map((r) => (
            <div
              key={`${r.owner}/${r.repo}`}
              className="border rounded-md p-4 space-y-2"
            >
              <div className="font-medium">
                <a
                  href={r.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {r.owner}/{r.repo}
                </a>
              </div>
              <div className="text-sm text-muted-foreground">
                {r.commits} commits • {r.issues} issues
              </div>
              <div className="flex gap-2 text-sm">
                <a
                  href={r.commitsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  View commits
                </a>
                <span className="text-muted-foreground">•</span>
                <a
                  href={r.issuesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  View issues
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
