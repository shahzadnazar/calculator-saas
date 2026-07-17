import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * The `guides` content collection — long-form articles that build topical
 * authority and interlink with the calculators. Authored in MDX so a guide can
 * embed a live calculator inline.
 */
const guides = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['finance', 'health', 'math', 'everyday']),
    /** Author key (see src/config/authors.ts). */
    author: z.string().default('editorial'),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    /** Registry references as "category/slug", used for interlinking. */
    relatedCalculators: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = { guides };
