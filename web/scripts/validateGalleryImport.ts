import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parse as parseDotenv } from "dotenv";
import type { Database } from "../src/types";
import {
  parseGalleryMarkdown,
  parseIndexMarkdown
} from "./parseGallery";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "..");
const galleryImagesBucket = "gallery-images";
const expectedCategoryCount = 13;
const expectedPromptCaseCount = 352;
const knownMissingPromptNumbers = [12, 169, 170];

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type PromptCaseRow = Database["public"]["Tables"]["prompt_cases"]["Row"];
type CategorySelectTable = {
  select(columns: string): {
    order(column: string, options: { ascending: boolean }): PromiseLike<{
      data: CategoryRow[] | null;
      error: { message: string } | null;
    }>;
  };
};
type PromptCaseSelectTable = {
  select(columns: string): {
    order(column: string, options: { ascending: boolean }): PromiseLike<{
      data: PromptCaseRow[] | null;
      error: { message: string } | null;
    }>;
  };
};

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const parsed = parseDotenv(readFileSync(filePath)) as Record<string, string>;
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function loadLocalCorpus() {
  const indexMarkdown = readFileSync(resolve(repoRoot, "index.md"), "utf8");
  const categories = parseIndexMarkdown(indexMarkdown);

  const promptCases = categories.flatMap((category) => {
    const galleryMarkdown = readFileSync(
      resolve(repoRoot, category.source_gallery_file),
      "utf8"
    );

    return parseGalleryMarkdown(
      category.source_gallery_file,
      category.name,
      galleryMarkdown
    );
  });

  return { categories, promptCases };
}

function ensureUniqueCaseNumbers(
  promptCases: Array<{ case_number: number; source_gallery_file: string }>
): void {
  const seen = new Map<number, string>();

  for (const promptCase of promptCases) {
    const priorGallery = seen.get(promptCase.case_number);
    if (priorGallery) {
      throw new Error(
        `Duplicate local case number ${promptCase.case_number} in ${priorGallery} and ${promptCase.source_gallery_file}`
      );
    }

    seen.set(promptCase.case_number, promptCase.source_gallery_file);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

async function main(): Promise<void> {
  loadEnvFile(resolve(webRoot, ".env"));
  loadEnvFile(resolve(webRoot, ".env.local"));

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);
  const { categories: localCategories, promptCases: localPromptCases } =
    loadLocalCorpus();
  ensureUniqueCaseNumbers(localPromptCases);
  const categoriesTable = supabase.from("categories") as unknown as CategorySelectTable;
  const promptCasesTable = supabase.from("prompt_cases") as unknown as PromptCaseSelectTable;

  if (localCategories.length !== expectedCategoryCount) {
    throw new Error(
      `Expected ${expectedCategoryCount} local categories, found ${localCategories.length}`
    );
  }

  if (localPromptCases.length !== expectedPromptCaseCount) {
    throw new Error(
      `Expected ${expectedPromptCaseCount} local prompt cases, found ${localPromptCases.length}`
    );
  }

  const { data: categoryRows, error: categoryError } = await categoriesTable
    .select("id, slug, name, sort_order, source_gallery_file")
    .order("sort_order", { ascending: true });

  if (categoryError) {
    throw new Error(`Category validation failed: ${categoryError.message}`);
  }

  if (!categoryRows) {
    throw new Error("Category validation failed: no rows returned");
  }

  assertEqual(
    categoryRows.length,
    localCategories.length,
    "Category count does not match local corpus"
  );

  const localCategoryBySlug = new Map(localCategories.map((category) => [category.slug, category]));
  const categoryIdByName = new Map<string, string>();

  for (const categoryRow of categoryRows) {
    const localCategory = localCategoryBySlug.get(categoryRow.slug);
    if (!localCategory) {
      throw new Error(`Unexpected database category slug: ${categoryRow.slug}`);
    }

    assertEqual(categoryRow.name, localCategory.name, `Category name mismatch for ${categoryRow.slug}`);
    assertEqual(
      categoryRow.sort_order,
      localCategory.sort_order,
      `Category sort order mismatch for ${categoryRow.slug}`
    );
    assertEqual(
      categoryRow.source_gallery_file,
      localCategory.source_gallery_file,
      `Category source gallery file mismatch for ${categoryRow.slug}`
    );

    categoryIdByName.set(categoryRow.name, categoryRow.id);
  }

  const localCaseNumbers = localPromptCases.map((promptCase) => promptCase.case_number);
  const localCaseNumberSet = new Set(localCaseNumbers);
  const { data: promptCaseRows, error: promptCaseError } = await promptCasesTable
    .select(
      "case_number, title, category_id, prompt_text, image_storage_path, image_public_url, summary, tags, source_gallery_file"
    )
    .order("case_number", { ascending: true });

  if (promptCaseError) {
    throw new Error(`Prompt case validation failed: ${promptCaseError.message}`);
  }

  if (!promptCaseRows) {
    throw new Error("Prompt case validation failed: no rows returned");
  }

  assertEqual(
    promptCaseRows.length,
    localPromptCases.length,
    "Prompt case count does not match local corpus"
  );

  const localPromptCaseByNumber = new Map(
    localPromptCases.map((promptCase) => [promptCase.case_number, promptCase])
  );

  for (const promptCaseRow of promptCaseRows) {
    if (!localCaseNumberSet.has(promptCaseRow.case_number)) {
      throw new Error(`Unexpected database case number: ${promptCaseRow.case_number}`);
    }

    const localPromptCase = localPromptCaseByNumber.get(promptCaseRow.case_number);
    if (!localPromptCase) {
      throw new Error(`Missing local prompt case ${promptCaseRow.case_number}`);
    }

    const categoryId = categoryIdByName.get(localPromptCase.category_name);
    if (!categoryId) {
      throw new Error(`Missing category id for ${localPromptCase.category_name}`);
    }

    const expectedStoragePath = `cases/case${localPromptCase.case_number}.jpg`;
    const expectedPublicUrl = supabase.storage
      .from(galleryImagesBucket)
      .getPublicUrl(expectedStoragePath).data.publicUrl;

    assertEqual(
      promptCaseRow.title,
      localPromptCase.title,
      `Title mismatch for case ${localPromptCase.case_number}`
    );
    assertEqual(
      promptCaseRow.category_id,
      categoryId,
      `Category id mismatch for case ${localPromptCase.case_number}`
    );
    assertEqual(
      promptCaseRow.prompt_text,
      localPromptCase.prompt_text,
      `Prompt text mismatch for case ${localPromptCase.case_number}`
    );
    assertEqual(
      promptCaseRow.image_storage_path,
      expectedStoragePath,
      `Image storage path mismatch for case ${localPromptCase.case_number}`
    );
    assertEqual(
      promptCaseRow.image_public_url,
      expectedPublicUrl,
      `Image public URL mismatch for case ${localPromptCase.case_number}`
    );
    assertEqual(
      promptCaseRow.summary,
      localPromptCase.summary,
      `Summary mismatch for case ${localPromptCase.case_number}`
    );
    assertEqual(
      promptCaseRow.tags,
      localPromptCase.tags,
      `Tags mismatch for case ${localPromptCase.case_number}`
    );
    assertEqual(
      promptCaseRow.source_gallery_file,
      localPromptCase.source_gallery_file,
      `Source gallery file mismatch for case ${localPromptCase.case_number}`
    );
  }

  assertEqual(
    [...new Set(promptCaseRows.map((row) => row.case_number))].sort((a, b) => a - b),
    [...localCaseNumberSet].sort((a, b) => a - b),
    "Database case numbers do not match local corpus"
  );

  console.log(
    JSON.stringify(
      {
        categories: localCategories.length,
        prompt_cases: localPromptCases.length,
        known_missing_prompt_numbers: knownMissingPromptNumbers
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
