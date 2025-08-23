import ProjectSidebarLayout from "@/components/ProjectSidebar";
import { ReactNode } from "react";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  return <ProjectSidebarLayout>{children}</ProjectSidebarLayout>;
}
