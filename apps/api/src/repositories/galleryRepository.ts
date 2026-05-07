import type { Category, PromptCase, PromptCaseScope } from "@imageodyssey/shared";

export type GalleryRepository = {
  listCategories: () => Promise<Category[]>;
  listPromptCases: (scope: PromptCaseScope) => Promise<PromptCase[]>;
};
