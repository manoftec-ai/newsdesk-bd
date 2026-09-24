import graphJson from "../data/event-graph.json" with { type: "json" };

export const graphMeta = () => graphJson.meta ?? {};

export const storyGraph = (slug) => graphJson.stories?.[slug] ?? null;

export const allStoryGraphs = () => graphJson.stories ?? {};

// Map a cluster_id back to its article slug (event-graph is keyed by site slug).
export const slugForCluster = (clusterId) => {
  for (const [slug, g] of Object.entries(graphJson.stories ?? {})) {
    if (Number(g?.cluster_id) === Number(clusterId)) return slug;
  }
  return null;
};

export const hasStoryGraph = (slug) => {
  const g = storyGraph(slug);
  return !!g && (g.events?.length ?? 0) > 0;
};

export const KIND_LABELS = {
  claim: "দাবি উঠেছে",
  evidence: "নতুন সূত্র যুক্ত হয়েছে",
  verify: "যাচাই-অবস্থা বদলেছে",
  conflict: "সূত্রে দ্বন্দ্ব ধরা পড়েছে",
};

// Why a claim's verification state period was opened/closed — maps the
// ledger `reason` column to reader-facing Bengali (append-only audit trail).
export const reasonLabel = (reason) =>
  ({
    initial: "প্রাথমিক যাচাই",
    "re-verify": "পুনর্যালোচনা",
    verify: "যাচাই",
    conflict: "দ্বন্দ্ব রেকর্ড",
    expiry: "মেয়াদোত্তীর্ণ",
  })[reason] ?? reason ?? "যাচাই";

// The _latest_ verification state for a story's timeline (the last `verify`
// event) so the reader sees where the chain currently stands without leaving
// the timeline for the claim card.
export const latestVerifyStatus = (graph) => {
  if (!graph) return null;
  const verifies = (graph.events ?? []).filter((e) => e.kind === "verify");
  return verifies.length ? verifies[verifies.length - 1] : null;
};

// Smallest + largest timestamp in the story graph (formatted locally).
export const graphSpan = (graph) => {
  if (!graph?.events?.length) return null;
  const ts = graph.events.map((e) => new Date(e.ts).getTime()).sort((a, b) => a - b);
  return { from: ts[0], to: ts[ts.length - 1] };
};