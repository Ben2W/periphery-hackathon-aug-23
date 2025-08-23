import { ReactNode } from "react";
import ProjectTabs from "@/components/ProjectTabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="space-y-4">
      <ProjectTabs projectId={projectId} />
      <div>{children}</div>
    </div>
  );
}
