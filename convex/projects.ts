import { v } from "convex/values";
import {
  query,
  mutation,
  internalAction,
  internalMutation,
} from "./_generated/server";
import { api, internal } from "./_generated/api";

export const listProjects = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      _creationTime: v.number(),
      name: v.string(),
      description: v.string(),
      analysisStatus: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("complete"),
        v.literal("failed"),
      ),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db.query("projects").order("desc").collect();
    return rows.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      name: r.name,
      description: r.description,
      analysisStatus: (r as any).analysisStatus ?? "pending",
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
      analysisStatus: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("complete"),
        v.literal("failed"),
      ),
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
      analysisStatus: (doc as any).analysisStatus ?? "pending",
    };
  },
});

export const createProject = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    packageJson: v.string(),
    packageName: v.optional(v.string()),
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
      analysisStatus: "processing",
    });
    await ctx.db.insert("projectPackages", {
      projectId: id,
      name: args.packageName ?? "package.json",
      content: args.packageJson,
    });
    return id;
  },
});

export const researchDependencies = internalAction({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const projectId = args.projectId;
    // Mark processing
    await ctx.runMutation(internal.projects.setAnalysisStatus, {
      projectId,
      status: "processing",
    });

    try {
      // Load all packages for the project
      type Pkg = {
        _id: string;
        _creationTime: number;
        projectId: string;
        name: string;
        content: string;
      };
      const packages: Array<Pkg> = await ctx.runQuery(
        api.projects.listProjectPackages,
        { projectId },
      );

      // Combine dependencies across all package.json files
      const depToVersion: Map<string, string> = new Map();
      for (const p of packages) {
        try {
          const json = JSON.parse(p.content) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
          const all: Array<[string, string]> = Object.entries(
            json.dependencies ?? {},
          ).concat(Object.entries(json.devDependencies ?? {}));
          for (const [name, version] of all) {
            if (!depToVersion.has(name)) depToVersion.set(name, version);
          }
        } catch (e) {
          // ignore malformed package.json (already validated on insert)
        }
      }

      // Fetch GitHub repo URLs from npm registry
      async function fetchGithubUrl(
        pkgName: string,
      ): Promise<string | undefined> {
        try {
          const resp = await fetch(
            `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`,
          );
          if (!resp.ok) return undefined;
          const data = await resp.json();
          const latestTag: string | undefined = data["dist-tags"]?.latest;
          const latest = latestTag && data.versions?.[latestTag];
          const repoUrlRaw: string | undefined =
            latest?.repository?.url || data.repository?.url || data.repository;
          if (!repoUrlRaw || typeof repoUrlRaw !== "string") return undefined;
          // Normalize
          let url = repoUrlRaw
            .replace(/^git\+/, "")
            .replace(/^git:\/\//, "https://")
            .replace(/^ssh:\/\//, "https://")
            .replace(/^git@github.com:/, "https://github.com/");
          if (url.endsWith(".git")) url = url.slice(0, -4);
          return url;
        } catch (e) {
          return undefined;
        }
      }

      const depsArray = Array.from(depToVersion.entries());
      const depsWithMeta = await Promise.all(
        depsArray.map(async ([name, versionSpec]) => ({
          packageName: name,
          versionSpec,
          githubUrl: await fetchGithubUrl(name),
        })),
      );

      // Upsert dependencies for project
      await ctx.runMutation(internal.projects.upsertProjectDependencies, {
        projectId,
        deps: depsWithMeta,
      });

      // Prepare prompt for Anthropic
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const depNames = depsWithMeta.map((d) => d.packageName);
      const instruction =
        "You are scoring repository relevance for understanding a codebase. " +
        "Given a list of npm packages, return a JSON object mapping each package name to a float score between 0 and 1. " +
        "Higher scores indicate technologies that, if known, help someone understand the repo (frameworks, runtimes, routers, state mgmt, ORMs, build tools). " +
        "Lower scores are utility/helper libraries (date-fns, lodash, uuid). Do not include explanations. JSON only.";

      const userContent = `Packages: ${JSON.stringify(depNames)}\nReturn JSON mapping package -> score, e.g. {\"react\": 0.95}.`;

      const completion = await anthropic.messages.create({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 1024,
        temperature: 0,
        messages: [
          { role: "user", content: `${instruction}\n\n${userContent}` },
        ],
      });

      let text = "";
      const block = completion.content?.[0] as any;
      if (block && block.type === "text" && typeof block.text === "string") {
        text = block.text;
      } else if (typeof (completion as any).output_text === "string") {
        text = (completion as any).output_text;
      }

      function extractJson(s: string): string | null {
        const codeFence = s.match(/```json[\s\S]*?```/i);
        if (codeFence) {
          const inner = codeFence[0].replace(/```json/i, "").replace(/```/, "");
          return inner.trim();
        }
        const braceStart = s.indexOf("{");
        const braceEnd = s.lastIndexOf("}");
        if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
          return s.slice(braceStart, braceEnd + 1);
        }
        return null;
      }

      const jsonText = extractJson(text) ?? text;
      let scores: Record<string, number> = {};
      try {
        const parsed = JSON.parse(jsonText);
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            const num = Number(v);
            if (!Number.isNaN(num)) scores[k] = Math.min(1, Math.max(0, num));
          }
        }
      } catch (e) {
        // If parsing fails, fall back to zeros
        scores = Object.fromEntries(depNames.map((n) => [n, 0]));
      }

      await ctx.runMutation(internal.projects.updateDependencyScores, {
        projectId,
        scores,
      });

      await ctx.runMutation(internal.projects.setAnalysisStatus, {
        projectId,
        status: "complete",
      });
    } catch (e) {
      console.error("Dependency research failed", e);
      await ctx.runMutation(internal.projects.setAnalysisStatus, {
        projectId,
        status: "failed",
      });
    }
    return null;
  },
});

export const listProjectPackages = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("projectPackages"),
      _creationTime: v.number(),
      projectId: v.id("projects"),
      name: v.string(),
      content: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projectPackages")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
    return rows;
  },
});

export const addProjectPackage = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    content: v.string(),
  },
  returns: v.id("projectPackages"),
  handler: async (ctx, args) => {
    try {
      JSON.parse(args.content);
    } catch (e) {
      throw new Error("content must be valid JSON string");
    }
    const exists = await ctx.db.get(args.projectId);
    if (!exists) {
      throw new Error("Project not found");
    }
    const id = await ctx.db.insert("projectPackages", {
      projectId: args.projectId,
      name: args.name,
      content: args.content,
    });
    return id;
  },
});

export const startDependencyAnalysis = mutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const exists = await ctx.db.get(args.projectId);
    if (!exists) throw new Error("Project not found");
    await ctx.scheduler.runAfter(0, internal.projects.researchDependencies, {
      projectId: args.projectId,
    });
    return null;
  },
});

export const setAnalysisStatus = internalMutation({
  args: {
    projectId: v.id("projects"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("complete"),
      v.literal("failed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.projectId);
    if (!doc) throw new Error("Project not found");
    await ctx.db.patch(args.projectId, { analysisStatus: args.status });
    return null;
  },
});

export const upsertProjectDependencies = internalMutation({
  args: {
    projectId: v.id("projects"),
    deps: v.array(
      v.object({
        packageName: v.string(),
        versionSpec: v.string(),
        githubUrl: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Delete existing dependencies for project
    const existing = await ctx.db
      .query("projectDependencies")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    for (const dep of args.deps) {
      await ctx.db.insert("projectDependencies", {
        projectId: args.projectId,
        packageName: dep.packageName,
        versionSpec: dep.versionSpec,
        githubUrl: dep.githubUrl,
      });
    }
    return null;
  },
});

export const updateDependencyScores = internalMutation({
  args: {
    projectId: v.id("projects"),
    scores: v.record(v.string(), v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projectDependencies")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const nameToScore = args.scores;
    for (const row of rows) {
      const score = nameToScore[row.packageName];
      await ctx.db.patch(row._id, {
        importanceScore:
          typeof score === "number" && !Number.isNaN(score)
            ? Math.min(1, Math.max(0, score))
            : 0,
      });
    }
    return null;
  },
});

export const listRelevantDependencies = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("projectDependencies"),
      _creationTime: v.number(),
      projectId: v.id("projects"),
      packageName: v.string(),
      versionSpec: v.string(),
      githubUrl: v.optional(v.string()),
      importanceScore: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projectDependencies")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    // Sort by score desc (undefined last)
    rows.sort((a, b) => (b.importanceScore ?? -1) - (a.importanceScore ?? -1));
    return rows;
  },
});
