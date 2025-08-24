"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

export type RepoItem = {
  repoKey: string;
  packageName: string;
  userCount: number;
};

export function RepoFilters({
  repos,
  selected,
  onToggle,
}: {
  repos: Array<RepoItem> | undefined;
  selected: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Filter by dependency</div>
      <div className="flex flex-wrap gap-3">
        {repos
          ? repos.map((r) => {
              const key = r.repoKey;
              const checked = selected[key] ?? true;
              return (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => onToggle(key, Boolean(v))}
                  />
                  <span>
                    {r.packageName} ({r.userCount})
                  </span>
                </label>
              );
            })
          : Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
      </div>
    </div>
  );
}
