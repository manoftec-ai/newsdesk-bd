import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const news = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/news",
    generateId: ({ entry }) => entry.replace(/\.md$/, "").replace(/[\\/]/g, "/"),
  }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    canonical: z.string().url().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    corrected: z.boolean().default(false),
    correctionNote: z.string().optional(),
    factCheck: z
      .object({
        claim: z.string().optional(),
        verdict: z
          .enum(["true", "mostly-true", "half", "mostly-false", "false", "unverifiable", "misleading"])
          .optional(),
        verifiedDate: z.coerce.date().optional(),
        note: z.string().optional(),
      })
      .optional(),
    tracked: z.boolean().default(false),
    lastChecked: z.coerce.date().optional(),
    updates: z
      .array(
        z.object({
          date: z.coerce.date(),
          note: z.string(),
          badge: z.enum(["verified", "confirmed", "partial", "suspect"]).optional(),
          label: z.string().optional(),
        }),
      )
      .default([]),
    readingTime: z.number().int().positive().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    author: z.string().default("desk"),
    lang: z.enum(["bn", "en"]).default("bn"),
    thumbnail: z.string().optional(),
    thumbnailAlt: z.string().default(""),
    featured: z.boolean().default(false),
    breaking: z.boolean().default(false),
    demo: z.boolean().default(false),
    draft: z.boolean().default(false),
    sources: z
      .array(
        z.object({
          name: z.string(),
          url: z.string().url(),
        }),
      )
      .default([]),
    verification: z
      .object({
        badge: z.enum(["verified", "confirmed", "partial", "suspect"]).default("partial"),
        tier: z.enum(["A", "B", "C"]).default("B"),
        score: z.number().optional(),
        evidence: z
          .array(
            z.object({
              type: z.string(),
              label: z.string(),
              url: z.string().url().optional(),
            }),
          )
          .default([]),
      })
      .optional(),
  }),
});

export const collections = { news };