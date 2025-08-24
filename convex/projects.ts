import { v } from "convex/values";
import {
  query,
  mutation,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

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

      // Only analyze dependencies that have a GitHub URL
      const analyzable = depsWithMeta.filter((d) => !!d.githubUrl);
      const depNames = analyzable.map((d) => d.packageName);
      const instruction =
        "You are scoring repository dependencies for signal. " +
        "Given a list of npm packages, return a JSON object mapping each package name to two floats in [0,1]: relevance and niche. " +
        "Relevance: How much knowing this package helps understand the repo (frameworks, runtimes, routers, state mgmt, ORMs, build tools are high). Helpers and utilities are low. " +
        "Niche: Common/popular packages are low (react, nextjs), niche/less ubiquitous are high (effect, hono, convex, supabase, clerk). " +
        "Respond with JSON only of shape { pkg: { relevance: number, niche: number } }.";

      const userContent = `Packages: ${JSON.stringify(
        depNames,
      )}\nReturn JSON mapping package -> {relevance, niche}.`;

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
      let scores: Record<string, { relevance: number; niche: number }> = {};
      try {
        const parsed = JSON.parse(jsonText);
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            const rel = Number((v as any)?.relevance);
            const niche = Number((v as any)?.niche);
            if (!Number.isNaN(rel) && !Number.isNaN(niche)) {
              scores[k] = {
                relevance: Math.min(1, Math.max(0, rel)),
                niche: Math.min(1, Math.max(0, niche)),
              };
            }
          }
        }
      } catch (e) {
        // If parsing fails, fall back to zeros
        scores = Object.fromEntries(
          depNames.map((n) => [n, { relevance: 0, niche: 0 }]),
        );
      }

      await ctx.runMutation(internal.projects.updateDependencyScores, {
        projectId,
        scores,
      });

      await ctx.runMutation(internal.projects.setAnalysisStatus, {
        projectId,
        status: "complete",
      });

      // Kick off GitHub scraping workflow now that analysis is complete
      await workflow.start(ctx, internal.projects.scrapeGithubWorkflow, {
        projectId,
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
    scores: v.record(
      v.string(),
      v.object({ relevance: v.number(), niche: v.number() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projectDependencies")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const nameToScore = args.scores;
    for (const row of rows) {
      // Skip rows that do not have a score (e.g., no GitHub URL analyzed)
      const s = nameToScore[row.packageName];
      if (!s || !row.githubUrl) continue;
      const relevance = s.relevance;
      const niche = s.niche;
      const importance = Math.min(1, Math.max(0, relevance));
      const nicheScore = Math.min(1, Math.max(0, niche));
      const signal = importance * nicheScore;
      await ctx.db.patch(row._id, {
        importanceScore: importance,
        nicheScore,
        signalScore: signal,
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
      nicheScore: v.optional(v.number()),
      signalScore: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projectDependencies")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    // Sort by signal desc (undefined last)
    rows.sort((a, b) => (b.signalScore ?? -1) - (a.signalScore ?? -1));
    return rows;
  },
});

export const getSignalCutoff = query({
  args: {},
  returns: v.number(),
  handler: async () => {
    // Static cutoff tuned to exclude ubiquitous deps like react/next,
    // while including high-signal tech (effect, hono, convex, clerk, supabase).
    // Can be adjusted later or made configurable.
    return 0.35;
  },
});

// Initialize workflow manager for installed component
export const workflow = new WorkflowManager(components.workflow);

export const scrapeGithubWorkflow = workflow.define({
  args: { projectId: v.id("projects") },
  // explicit return type for determinism typing
  handler: async (step, args): Promise<void> => {
    // Mark scrape row started
    await step.runMutation(internal.projects.upsertGithubScrape, {
      projectId: args.projectId,
      finished: false,
      totalRepos: 0,
      processedRepos: 0,
      percent: 0,
    });

    // Load dependencies with GitHub URLs
    const deps: Array<{ packageName: string; githubUrl: string }> =
      await step.runQuery(internal.projects._listDepsWithGithub, {
        projectId: args.projectId,
      });
    await step.runMutation(internal.projects.upsertGithubScrape, {
      projectId: args.projectId,
      finished: false,
      totalRepos: deps.length,
      processedRepos: 0,
      percent: deps.length === 0 ? 100 : 0,
    });
    await step.runMutation(internal.projects.appendGithubLog, {
      projectId: args.projectId,
      level: "info",
      message: `Starting GitHub scrape for ${deps.length} repos`,
      step: "start",
    });

    // Process repos sequentially via an action per repo
    for (const d of deps) {
      const { owner, repo } = parseGithub(d.githubUrl);
      await step.runAction(internal.projects.processRepo, {
        projectId: args.projectId,
        owner,
        repo,
      });
    }

    // Mark finished
    await step.runMutation(internal.projects.upsertGithubScrape, {
      projectId: args.projectId,
      finished: true,
      processedRepos: deps.length,
      percent: 100,
    });
    await step.runMutation(internal.projects.appendGithubLog, {
      projectId: args.projectId,
      level: "info",
      message: `Finished GitHub scrape for ${deps.length} repos`,
      step: "done",
    });
  },
});

function parseGithub(url?: string): { owner: string; repo: string } {
  if (!url) throw new Error("Missing GitHub URL");
  // supports https://github.com/owner/repo or with trailing parts
  const m = url.match(/github\.com\/(.*?)\/(.*?)(?:$|\.|\/)/i);
  if (!m) throw new Error("Invalid GitHub URL: " + url);
  return { owner: m[1], repo: m[2] };
}

export const _listDepsWithGithub = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({ packageName: v.string(), githubUrl: v.string() }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projectDependencies")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const cutoff: number = await ctx.runQuery(
      api.projects.getSignalCutoff,
      {} as any,
    );
    return rows
      .filter(
        (r) =>
          !!r.githubUrl &&
          typeof r.signalScore === "number" &&
          r.signalScore >= cutoff,
      )
      .map((r) => ({ packageName: r.packageName, githubUrl: r.githubUrl! }));
  },
});

export const fetchCommitContributors = internalAction({
  args: { owner: v.string(), repo: v.string() },
  returns: v.array(
    v.object({ login: v.string(), html_url: v.string(), count: v.number() }),
  ),
  handler: async (ctx, args) => {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "periphery-app",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const url = `https://api.github.com/repos/${args.owner}/${args.repo}/contributors?per_page=100&anon=false`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<any>;
    return data
      .filter((u) => u && u.login)
      .map((u) => ({
        login: u.login,
        html_url: u.html_url,
        count: u.contributions ?? 0,
      }));
  },
});

export const fetchIssueCreators = internalAction({
  args: { owner: v.string(), repo: v.string() },
  returns: v.array(
    v.object({ login: v.string(), html_url: v.string(), count: v.number() }),
  ),
  handler: async (ctx, args) => {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "periphery-app",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    // Use issues events to count unique creators and their counts
    // For simplicity, fetch recent 100 issues and aggregate by user
    const url = `https://api.github.com/repos/${args.owner}/${args.repo}/issues?state=all&per_page=100`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<any>;
    const counts: Record<
      string,
      { login: string; html_url: string; count: number }
    > = {};
    for (const it of data) {
      const user = it?.user;
      if (!user || !user.login) continue;
      const key = user.login;
      if (!counts[key])
        counts[key] = { login: user.login, html_url: user.html_url, count: 0 };
      counts[key].count += 1;
    }
    return Object.values(counts);
  },
});

// Fetch public members of an organization. GitHub only returns public members here.
export const fetchOrgPublicMembers = internalAction({
  args: { org: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "periphery-app",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    // Note: Only public members are returned. That's sufficient to exclude many maintainers.
    const url = `https://api.github.com/orgs/${args.org}/members?per_page=100`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<any>;
    return data
      .map((u) => (u && typeof u.login === "string" ? u.login : undefined))
      .filter((x): x is string => !!x);
  },
});

export const processRepo = internalAction({
  args: { projectId: v.id("projects"), owner: v.string(), repo: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.projects.appendGithubLog, {
      projectId: args.projectId,
      level: "info",
      message: `Fetching repo ${args.owner}/${args.repo}`,
      step: "fetch_repo",
    });
    // Fetch org public members to exclude first-party maintainers
    const [orgMembers, committers, issuers] = await Promise.all([
      ctx.runAction(internal.projects.fetchOrgPublicMembers, {
        org: args.owner,
      }),
      ctx.runAction(internal.projects.fetchCommitContributors, {
        owner: args.owner,
        repo: args.repo,
      }),
      ctx.runAction(internal.projects.fetchIssueCreators, {
        owner: args.owner,
        repo: args.repo,
      }),
    ]);
    const memberSet: Record<string, true> = Object.create(null);
    for (const m of orgMembers) memberSet[m] = true;
    const filteredCommitters = committers.filter((c) => !memberSet[c.login]);
    const filteredIssuers = issuers.filter((i) => !memberSet[i.login]);

    // Optionally log how many were excluded for transparency
    if (orgMembers.length > 0) {
      const excluded =
        committers.length +
        issuers.length -
        (filteredCommitters.length + filteredIssuers.length);
      if (excluded > 0) {
        await ctx.runMutation(internal.projects.appendGithubLog, {
          projectId: args.projectId,
          level: "info",
          message: `Excluded ${excluded} org member(s) from ${args.owner}`,
          step: "exclude_org_members",
        });
      }
    }
    for (const c of filteredCommitters as Array<{
      login: string;
      html_url: string;
      count: number;
    }>) {
      await ctx.runMutation(internal.projects.mergeUserInfluence, {
        projectId: args.projectId,
        username: c.login,
        htmlUrl: c.html_url,
        commitsDelta: c.count,
        issuesDelta: 0,
      });
      await ctx.runMutation(internal.projects.mergeRepoUserInfluence, {
        projectId: args.projectId,
        username: c.login,
        owner: args.owner,
        repo: args.repo,
        commitsDelta: c.count,
        issuesDelta: 0,
      });
    }
    for (const i of filteredIssuers as Array<{
      login: string;
      html_url: string;
      count: number;
    }>) {
      await ctx.runMutation(internal.projects.mergeUserInfluence, {
        projectId: args.projectId,
        username: i.login,
        htmlUrl: i.html_url,
        commitsDelta: 0,
        issuesDelta: i.count,
      });
      await ctx.runMutation(internal.projects.mergeRepoUserInfluence, {
        projectId: args.projectId,
        username: i.login,
        owner: args.owner,
        repo: args.repo,
        commitsDelta: 0,
        issuesDelta: i.count,
      });
    }
    await ctx.runMutation(internal.projects.incrementGithubProcessed, {
      projectId: args.projectId,
    });
    const row = await ctx.runQuery(api.projects.getGithubScrape, {
      projectId: args.projectId,
    });
    await ctx.runMutation(internal.projects.appendGithubLog, {
      projectId: args.projectId,
      level: "info",
      message: `Processed ${args.owner}/${args.repo} (${row?.processedRepos ?? 0}/${row?.totalRepos ?? 0})`,
      step: "progress",
    });
    return null;
  },
});

export const mergeRepoUserInfluence = internalMutation({
  args: {
    projectId: v.id("projects"),
    username: v.string(),
    owner: v.string(),
    repo: v.string(),
    commitsDelta: v.number(),
    issuesDelta: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubUserRepoInfluence")
      .withIndex("by_project_owner_repo", (q) =>
        q
          .eq("projectId", args.projectId)
          .eq("owner", args.owner)
          .eq("repo", args.repo),
      )
      .collect();
    // There may be multiple users per repo; filter again by username
    const row = existing.find((r) => r.username === args.username);
    if (row) {
      await ctx.db.patch(row._id, {
        commits: row.commits + args.commitsDelta,
        issues: row.issues + args.issuesDelta,
      });
    } else {
      await ctx.db.insert("githubUserRepoInfluence", {
        projectId: args.projectId,
        username: args.username,
        owner: args.owner,
        repo: args.repo,
        commits: args.commitsDelta,
        issues: args.issuesDelta,
      });
    }
    return null;
  },
});

export const getGithubUserDetail = query({
  args: { projectId: v.id("projects"), username: v.string() },
  returns: v.object({
    username: v.string(),
    htmlUrl: v.optional(v.string()),
    totalCommits: v.number(),
    totalIssues: v.number(),
    affectedRepos: v.number(),
    totalRelevantRepos: v.number(),
    repos: v.array(
      v.object({
        owner: v.string(),
        repo: v.string(),
        commits: v.number(),
        issues: v.number(),
        repoUrl: v.string(),
        commitsUrl: v.string(),
        issuesUrl: v.string(),
      }),
    ),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    username: string;
    htmlUrl?: string;
    totalCommits: number;
    totalIssues: number;
    affectedRepos: number;
    totalRelevantRepos: number;
    repos: Array<{
      owner: string;
      repo: string;
      commits: number;
      issues: number;
      repoUrl: string;
      commitsUrl: string;
      issuesUrl: string;
    }>;
  }> => {
    const agg = await ctx.db
      .query("githubUserInfluence")
      .withIndex("by_project_and_username", (q) =>
        q.eq("projectId", args.projectId).eq("username", args.username),
      )
      .unique();
    const rows = (await ctx.db
      .query("githubUserRepoInfluence")
      .withIndex("by_project_and_username", (q) =>
        q.eq("projectId", args.projectId).eq("username", args.username),
      )
      .collect()) as Array<{
      owner: string;
      repo: string;
      commits: number;
      issues: number;
    }>;
    const deps: Array<{ packageName: string; githubUrl: string }> =
      await ctx.runQuery(internal.projects._listDepsWithGithub, {
        projectId: args.projectId,
      });
    const totalRelevantRepos: number = deps.length;
    const repos = rows.map((r) => {
      const owner = r.owner;
      const repo = r.repo;
      const repoUrl = `https://github.com/${owner}/${repo}`;
      const commitsUrl = `${repoUrl}/commits?author=${encodeURIComponent(args.username)}`;
      const issuesUrl = `${repoUrl}/issues?q=${encodeURIComponent(
        `author:${args.username}`,
      )}`;
      return {
        owner,
        repo,
        commits: r.commits,
        issues: r.issues,
        repoUrl,
        commitsUrl,
        issuesUrl,
      };
    });
    // Sort by combined influence per repo desc
    repos.sort((a, b) => b.commits + b.issues - (a.commits + a.issues));
    return {
      username: args.username,
      htmlUrl: agg?.htmlUrl,
      totalCommits: agg?.commits ?? 0,
      totalIssues: agg?.issues ?? 0,
      affectedRepos: repos.length,
      totalRelevantRepos,
      repos,
    };
  },
});

export const incrementGithubProcessed = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubScrapes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (!existing) return null;
    const total = existing.totalRepos ?? 0;
    const nextProcessed = (existing.processedRepos ?? 0) + 1;
    const percent = Math.round((nextProcessed / Math.max(1, total)) * 100);
    await ctx.db.patch(existing._id, {
      processedRepos: nextProcessed,
      percent,
    });
    return null;
  },
});

// --- GitHub scraping support ---
export const getGithubScrape = query({
  args: { projectId: v.id("projects") },
  returns: v.union(
    v.object({
      _id: v.id("githubScrapes"),
      _creationTime: v.number(),
      projectId: v.id("projects"),
      finishedScrapingGithub: v.boolean(),
      totalRepos: v.optional(v.number()),
      processedRepos: v.optional(v.number()),
      percent: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("githubScrapes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    return row ?? null;
  },
});

export const listGithubInfluence = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("githubUserInfluence"),
      _creationTime: v.number(),
      projectId: v.id("projects"),
      username: v.string(),
      htmlUrl: v.string(),
      commits: v.number(),
      issues: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("githubUserInfluence")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    rows.sort((a, b) => b.commits + b.issues - (a.commits + a.issues));
    return rows;
  },
});

export const upsertGithubScrape = internalMutation({
  args: {
    projectId: v.id("projects"),
    finished: v.boolean(),
    totalRepos: v.optional(v.number()),
    processedRepos: v.optional(v.number()),
    percent: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubScrapes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        finishedScrapingGithub: args.finished,
        totalRepos: args.totalRepos ?? existing.totalRepos,
        processedRepos: args.processedRepos ?? existing.processedRepos,
        percent: args.percent ?? existing.percent,
      });
    } else {
      await ctx.db.insert("githubScrapes", {
        projectId: args.projectId,
        finishedScrapingGithub: args.finished,
        totalRepos: args.totalRepos,
        processedRepos: args.processedRepos,
        percent: args.percent,
      });
    }
    return null;
  },
});

export const appendGithubLog = internalMutation({
  args: {
    projectId: v.id("projects"),
    level: v.string(),
    message: v.string(),
    step: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("githubScrapeLogs", {
      projectId: args.projectId,
      level: args.level,
      message: args.message,
      step: args.step,
    });
    return null;
  },
});

export const listGithubLogs = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("githubScrapeLogs"),
      _creationTime: v.number(),
      projectId: v.id("projects"),
      level: v.string(),
      message: v.string(),
      step: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("githubScrapeLogs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(200);
    return rows;
  },
});

export const mergeUserInfluence = internalMutation({
  args: {
    projectId: v.id("projects"),
    username: v.string(),
    htmlUrl: v.string(),
    commitsDelta: v.number(),
    issuesDelta: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubUserInfluence")
      .withIndex("by_project_and_username", (q) =>
        q.eq("projectId", args.projectId).eq("username", args.username),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        commits: existing.commits + args.commitsDelta,
        issues: existing.issues + args.issuesDelta,
      });
    } else {
      await ctx.db.insert("githubUserInfluence", {
        projectId: args.projectId,
        username: args.username,
        htmlUrl: args.htmlUrl,
        commits: args.commitsDelta,
        issues: args.issuesDelta,
      });
    }
    return null;
  },
});
