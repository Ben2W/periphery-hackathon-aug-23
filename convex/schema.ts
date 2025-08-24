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
  githubScrapes: defineTable({
    projectId: v.id("projects"),
    finishedScrapingGithub: v.boolean(),
    totalRepos: v.optional(v.number()),
    processedRepos: v.optional(v.number()),
    percent: v.optional(v.number()),
  }).index("by_project", ["projectId"]),
  githubScrapeLogs: defineTable({
    projectId: v.id("projects"),
    level: v.string(),
    message: v.string(),
    step: v.optional(v.string()),
  }).index("by_project", ["projectId"]),
  githubUserInfluence: defineTable({
    projectId: v.id("projects"),
    username: v.string(),
    htmlUrl: v.string(),
    commits: v.number(),
    issues: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_username", ["projectId", "username"]),
});
