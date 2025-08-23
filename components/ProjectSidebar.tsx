"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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
import AddProjectWizard from "@/components/AddProjectWizard";

export default function ProjectSidebarLayout() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const projects = useQuery(api.projects.listProjects) ?? [];

  const selected = projects.find((p) => p._id === selectedId) ?? null;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Projects</span>
            <AddProjectWizard />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>All projects</SidebarGroupLabel>
            <SidebarMenu>
              {projects.map((p) => (
                <SidebarMenuItem key={p._id}>
                  <SidebarMenuButton
                    isActive={selectedId === p._id}
                    onClick={() => setSelectedId(p._id)}
                  >
                    <span>{p.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <div className="flex items-center gap-2 border-b px-4 h-12">
          <SidebarTrigger />
          <div className="font-medium">
            {selected ? selected.name : "Select a project"}
          </div>
        </div>
        <div className="p-6">
          {selected ? (
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{selected.name}</h2>
              <p className="text-sm text-muted-foreground">
                {selected.description}
              </p>
              <div className="mt-6 text-sm opacity-70">(todo)</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Choose a project from the sidebar or add a new one.
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
