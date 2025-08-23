"use client";

import ProjectSidebarLayout from "@/components/ProjectSidebar";

export default function Home() {
  return (
    <ProjectSidebarLayout>
      <div className="text-sm text-muted-foreground">
        Choose a project from the sidebar or add a new one.
      </div>
    </ProjectSidebarLayout>
  );
}
