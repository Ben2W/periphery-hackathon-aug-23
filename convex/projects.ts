import { v } from "convex/values";
import { query, mutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const listProjects = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db.query("projects").order("desc").collect();
    return rows.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      name: r.name,
      description: r.description,
    }));
  },
});

export const getProject = query({
  args: { id: v.id("projects") },
  returns: v.union(
    v.object({
      _id: v.id("projects"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
      packageJson: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    return {
      _id: doc._id,
      _creationTime: doc._creationTime,
      name: doc.name,
      description: doc.description,
      packageJson: doc.packageJson,
    };
  },
});

export const createProject = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    packageJson: v.string(),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    // Validate package.json is valid JSON
    try {
      JSON.parse(args.packageJson);
    } catch (e) {
      throw new Error("package.json must be valid JSON string");
    }
    const id = await ctx.db.insert("projects", {
      name: args.name,
      description: args.description,
      packageJson: args.packageJson,
    });
    // Schedule research workflow scaffold (no-op for now)
    await ctx.scheduler.runAfter(0, internal.projects.researchDependencies, {
      projectId: id,
    });
    return id;
  },
});

export const researchDependencies = internalAction({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Placeholder for future deep research workflow.
    // Intentionally left unimplemented per requirements.
    console.log("Research workflow queued for", String(args.projectId));
    return null;
  },
});
