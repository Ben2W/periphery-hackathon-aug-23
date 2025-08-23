"use client";

import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
// AddProjectWizard is deprecated in favor of /project/new page

export default function ProjectSidebarLayout({
  children,
}: {
  children: ReactNode;
}) {
  const projects = useQuery(api.projects.listProjects) ?? [];
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Projects</span>
            <Link href="/project/new" className="text-xs underline">
              Add project
            </Link>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>All projects</SidebarGroupLabel>
            <SidebarMenu>
              {projects.map((p) => {
                const href = `/project/${p._id}`;
                const isActive = pathname?.startsWith(href) ?? false;
                return (
                  <SidebarMenuItem key={p._id}>
                    <Link href={href} className="w-full">
                      <SidebarMenuButton isActive={isActive}>
                        <span>{p.name}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <div className="flex items-center gap-2 border-b px-4 h-12">
          <SidebarTrigger />
          <div className="font-medium">Projects</div>
        </div>
        <div className="p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
