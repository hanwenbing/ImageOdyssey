import { z } from "zod";

export const rewriteRequestSchema = z.object({
  case_number: z.number().int().positive(),
  original_prompt_text: z.string().min(1)
});

export const rewriteResponseSchema = z.object({
  rewritten_prompt_text: z.string().min(1)
});

export type RewriteRequest = z.infer<typeof rewriteRequestSchema>;
export type RewriteResponse = z.infer<typeof rewriteResponseSchema>;
