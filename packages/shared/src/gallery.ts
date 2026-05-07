import { z } from "zod";

export const categorySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  sort_order: z.number().int()
});

export const promptCaseSchema = z.object({
  id: z.string().min(1),
  case_number: z.number().int().positive(),
  title: z.string().min(1),
  category_slug: z.string().min(1),
  category_name: z.string().min(1),
  prompt_text: z.string().min(1),
  image_path: z.string().min(1),
  summary: z.string(),
  tags: z.array(z.string())
});

export const categoriesResponseSchema = z.object({
  categories: z.array(categorySchema)
});

export const promptCasesResponseSchema = z.object({
  cases: z.array(promptCaseSchema)
});

export const promptCaseScopeSchema = z.enum(["featured", "all"]);

export type Category = z.infer<typeof categorySchema>;
export type PromptCase = z.infer<typeof promptCaseSchema>;
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;
export type PromptCasesResponse = z.infer<typeof promptCasesResponseSchema>;
export type PromptCaseScope = z.infer<typeof promptCaseScopeSchema>;
