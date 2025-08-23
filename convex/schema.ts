import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
  numbers: defineTable({
    value: v.number(),
  }),
  projects: defineTable({
    name: v.string(),
    description: v.string(),
    analysisStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("complete"),
      v.literal("failed"),
    ),
  }),
  projectPackages: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    content: v.string(),
  }).index("by_project", ["projectId"]),
  projectDependencies: defineTable({
    projectId: v.id("projects"),
    packageName: v.string(),
    versionSpec: v.string(),
    githubUrl: v.optional(v.string()),
    importanceScore: v.optional(v.number()),
    nicheScore: v.optional(v.number()),
    signalScore: v.optional(v.number()),
  }).index("by_project", ["projectId"]),
});
