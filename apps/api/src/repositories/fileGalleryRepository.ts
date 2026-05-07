import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  categorySchema,
  promptCaseSchema,
  type Category,
  type PromptCase,
  type PromptCaseScope
} from "@imageodyssey/shared";
import type { GalleryRepository } from "./galleryRepository";

const repoRoot = resolve(process.cwd(), "..", "..");
const dataDir = resolve(repoRoot, "data", "gallery");

async function readJson<T>(fileName: string): Promise<T> {
  const text = await readFile(resolve(dataDir, fileName), "utf8");
  return JSON.parse(text) as T;
}

export function createFileGalleryRepository(): GalleryRepository {
  return {
    async listCategories(): Promise<Category[]> {
      const categories = await readJson<unknown[]>("categories.json");
      return categories.map((category) => categorySchema.parse(category));
    },

    async listPromptCases(scope: PromptCaseScope): Promise<PromptCase[]> {
      const cases = (await readJson<unknown[]>("prompt-cases.json")).map((promptCase) =>
        promptCaseSchema.parse(promptCase)
      );

      if (scope === "all") {
        return cases;
      }

      const featuredCaseNumbers = new Set(await readJson<number[]>("featured-case-numbers.json"));
      return cases.filter((promptCase) => featuredCaseNumbers.has(promptCase.case_number));
    }
  };
}
