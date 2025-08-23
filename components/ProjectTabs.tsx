"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

type ProjectTabsProps = {
  projectId: string;
};

export default function ProjectTabs({ projectId }: ProjectTabsProps) {
  const router = useRouter();
  const pathname = usePathname();

  const current = useMemo(() => {
    if (!pathname) return "info";
    if (pathname.endsWith("/relevant-people")) return "relevant-people";
    if (pathname.endsWith("/relevant-dependencies"))
      return "relevant-dependencies";
    return "info";
  }, [pathname]);

  return (
    <div className="space-y-2">
      <div className="flex h-9 items-center gap-2">
        <Button
          variant={current === "relevant-dependencies" ? "outline" : "ghost"}
          size="sm"
          aria-current={
            current === "relevant-dependencies" ? "page" : undefined
          }
          onClick={() =>
            router.push(`/project/${projectId}/relevant-dependencies`)
          }
        >
          Relevant dependencies
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button
          variant={current === "relevant-people" ? "outline" : "ghost"}
          size="sm"
          aria-current={current === "relevant-people" ? "page" : undefined}
          onClick={() => router.push(`/project/${projectId}/relevant-people`)}
        >
          Relevant people
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button
          variant={current === "info" ? "outline" : "ghost"}
          size="sm"
          aria-current={current === "info" ? "page" : undefined}
          onClick={() => router.push(`/project/${projectId}/info`)}
        >
          Info
        </Button>
      </div>
      <Separator />
    </div>
  );
}
