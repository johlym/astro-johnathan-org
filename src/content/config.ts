import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    date: z
      .string()
      .or(z.date())
      .transform((val) => {
        if (val instanceof Date) return val;
        const normalized = String(val).replace(/(\d{2}):(\d{3}Z)$/, "$1.$2");
        const d = new Date(normalized);
        return isNaN(d.getTime()) ? new Date(0) : d;
      }),
    slug: z
      .string()
      .nullish()
      .transform((v) => v ?? undefined),
    excerpt: z
      .string()
      .nullish()
      .transform((v) => v ?? undefined),
    description: z
      .string()
      .nullish()
      .transform((v) => v ?? undefined),
    category: z
      .string()
      .nullish()
      .transform((v) => v ?? undefined),
    featured: z
      .preprocess((val) => {
        if (typeof val === "boolean") return val;
        if (typeof val === "string") return val.trim().toLowerCase() === "true";
        return false;
      }, z.boolean())
      .optional()
      .default(false),
    feature_image: z
      .string()
      .nullish()
      .transform((v) => v ?? undefined),
    draft: z
      .preprocess((val) => {
        if (typeof val === "boolean") return val;
        if (typeof val === "string") return val.trim().toLowerCase() === "true";
        return false;
      }, z.boolean())
      .optional()
      .default(false),
  }),
});

export const collections = { posts };
