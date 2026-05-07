import { readFileSync, existsSync } from "node:fs";
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
const galleryRoot = resolve(repoRoot, "data", "gallery");
const galleryImagesBucket = "gallery-images";
const knownMissingPromptNumbers = [12, 169, 170];
const expectedCategoryCount = 13;
const expectedPromptCaseCount = 352;
const promptCaseBatchSize = 50;

type CategoryInsert = Database["public"]["Tables"]["categories"]["Insert"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type PromptCaseInsert = Database["public"]["Tables"]["prompt_cases"]["Insert"];
type PromptCaseRow = Database["public"]["Tables"]["prompt_cases"]["Row"];
type MutationResult = PromiseLike<{ error: { message: string } | null }>;
type SelectResult<Row> = PromiseLike<{
  data: Row[] | null;
  error: { message: string } | null;
}>;
type TableBuilder<Row, Insert> = {
  upsert(values: Insert[], options: { onConflict: string }): MutationResult;
  select(columns: string): SelectResult<Row>;
  delete(): {
    in(column: string, values: Array<string | number>): MutationResult;
  };
};
function loadEnvFile(
  filePath: string,
  options: { overrideLoadedKeys?: Set<string>; loadedKeys?: Set<string> } = {}
): void {
  if (!existsSync(filePath)) {
    return;
  }

  const parsed = parseDotenv(readFileSync(filePath)) as Record<string, string>;
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      options.loadedKeys?.add(key);
      continue;
    }

    if (options.overrideLoadedKeys?.has(key)) {
      process.env[key] = value;
      options.loadedKeys?.add(key);
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
  const indexMarkdown = readFileSync(resolve(galleryRoot, "index.md"), "utf8");
  const categories = parseIndexMarkdown(indexMarkdown);

  const promptCases = categories.flatMap((category) => {
    const galleryMarkdown = readFileSync(
      resolve(galleryRoot, category.source_gallery_file),
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

function getMissingPromptNumbers(localCaseNumbers: number[]): number[] {
  const caseNumberSet = new Set(localCaseNumbers);
  const maxCaseNumber = Math.max(...localCaseNumbers);
  const missingNumbers: number[] = [];

  for (let caseNumber = 1; caseNumber <= maxCaseNumber; caseNumber += 1) {
    if (!caseNumberSet.has(caseNumber)) {
      missingNumbers.push(caseNumber);
    }
  }

  return missingNumbers;
}

function validateLocalCorpusShape(promptCases: Array<{ case_number: number }>): void {
  if (promptCases.length !== expectedPromptCaseCount) {
    throw new Error(
      `Expected ${expectedPromptCaseCount} local prompt cases, found ${promptCases.length}`
    );
  }

  const localCaseNumbers = promptCases.map((promptCase) => promptCase.case_number);
  const missingPromptNumbers = getMissingPromptNumbers(localCaseNumbers);
  if (missingPromptNumbers.length !== knownMissingPromptNumbers.length) {
    throw new Error(
      `Expected ${knownMissingPromptNumbers.length} missing prompt numbers, found ${missingPromptNumbers.length}`
    );
  }

  const missingPromptNumbersJson = JSON.stringify(missingPromptNumbers);
  const expectedMissingPromptNumbersJson = JSON.stringify(knownMissingPromptNumbers);
  if (missingPromptNumbersJson !== expectedMissingPromptNumbersJson) {
    throw new Error(
      `Missing prompt numbers do not match expected local gaps: expected ${expectedMissingPromptNumbersJson}, got ${missingPromptNumbersJson}`
    );
  }
}

function failWithSupabaseError(scope: string, error: unknown): never {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  throw new Error(`${scope} failed: ${message}`);
}

async function main(): Promise<void> {
  const { categories, promptCases } = loadLocalCorpus();
  ensureUniqueCaseNumbers(promptCases);
  if (categories.length !== expectedCategoryCount) {
    throw new Error(
      `Expected ${expectedCategoryCount} local categories, found ${categories.length}`
    );
  }
  validateLocalCorpusShape(promptCases);

  const baseLoadedKeys = new Set<string>();
  loadEnvFile(resolve(webRoot, ".env"), { loadedKeys: baseLoadedKeys });
  loadEnvFile(resolve(webRoot, ".env.local"), {
    overrideLoadedKeys: baseLoadedKeys,
    loadedKeys: baseLoadedKeys
  });

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");
  const supabase = createClient<Database>(supabaseUrl, secretKey);
  const categoriesTable = supabase.from("categories") as unknown as TableBuilder<
    CategoryRow,
    CategoryInsert
  >;
  const promptCasesTable = supabase.from("prompt_cases") as unknown as TableBuilder<
    PromptCaseRow,
    PromptCaseInsert
  >;

  const categoryUpsertResult = await categoriesTable.upsert(
    categories.map(
      (category): CategoryInsert => ({
        slug: category.slug,
        name: category.name,
        sort_order: category.sort_order,
        source_gallery_file: category.source_gallery_file
      })
    ),
    { onConflict: "slug" }
  );

  if (categoryUpsertResult.error) {
    failWithSupabaseError("Category upsert", categoryUpsertResult.error);
  }

  const { data: categoryRows, error: categorySelectError } = await categoriesTable.select(
    "id, slug, name, sort_order, source_gallery_file"
  );

  if (categorySelectError) {
    failWithSupabaseError("Category select", categorySelectError);
  }

  if (!categoryRows) {
    throw new Error("Category select returned no rows");
  }

  const categoryIdBySourceFile = new Map<string, string>();
  for (const categoryRow of categoryRows) {
    categoryIdBySourceFile.set(categoryRow.source_gallery_file, categoryRow.id);
  }

  for (const category of categories) {
    if (!categoryIdBySourceFile.has(category.source_gallery_file)) {
      throw new Error(`Missing category id for ${category.source_gallery_file}`);
    }
  }

  const localCaseNumberSet = new Set(promptCases.map((promptCase) => promptCase.case_number));
  const { data: existingPromptCaseRows, error: existingPromptCaseError } =
    await promptCasesTable.select("case_number");

  if (existingPromptCaseError) {
    failWithSupabaseError("Prompt case pre-cleanup select", existingPromptCaseError);
  }

  const stalePromptCaseNumbers = (existingPromptCaseRows ?? [])
    .map((row) => row.case_number)
    .filter((caseNumber) => !localCaseNumberSet.has(caseNumber));

  if (stalePromptCaseNumbers.length > 0) {
    const { error: stalePromptCaseDeleteError } = await promptCasesTable
      .delete()
      .in("case_number", stalePromptCaseNumbers);

    if (stalePromptCaseDeleteError) {
      failWithSupabaseError("Prompt case cleanup delete", stalePromptCaseDeleteError);
    }
  }

  let importedPromptCaseCount = 0;
  const pendingPromptCases: PromptCaseInsert[] = [];

  const flushPromptCases = async (): Promise<void> => {
    if (pendingPromptCases.length === 0) {
      return;
    }

    const batch = pendingPromptCases.splice(0, pendingPromptCases.length);
    const { error } = await promptCasesTable.upsert(batch, {
      onConflict: "case_number"
    });

    if (error) {
      failWithSupabaseError("Prompt case upsert", error);
    }

    importedPromptCaseCount += batch.length;
  };

  for (const promptCase of promptCases) {
    const categoryId = categoryIdBySourceFile.get(promptCase.source_gallery_file);
    if (!categoryId) {
      throw new Error(`Missing category id for ${promptCase.source_gallery_file}`);
    }

    const localImagePath = resolve(galleryRoot, promptCase.local_image_path);
    if (!existsSync(localImagePath)) {
      throw new Error(`Missing image asset: data/gallery/${promptCase.local_image_path}`);
    }

    const storagePath = `cases/case${promptCase.case_number}.jpg`;
    const uploadBody = readFileSync(localImagePath);
    const { error: uploadError } = await supabase.storage
      .from(galleryImagesBucket)
      .upload(storagePath, uploadBody, {
        contentType: "image/jpeg",
        upsert: true
      });

    if (uploadError) {
      failWithSupabaseError(`Image upload for case ${promptCase.case_number}`, uploadError);
    }

    const { data: publicUrlData } = supabase.storage
      .from(galleryImagesBucket)
      .getPublicUrl(storagePath);

    pendingPromptCases.push({
      case_number: promptCase.case_number,
      title: promptCase.title,
      category_id: categoryId,
      prompt_text: promptCase.prompt_text,
      image_storage_path: storagePath,
      image_public_url: publicUrlData.publicUrl,
      summary: promptCase.summary,
      tags: promptCase.tags,
      source_gallery_file: promptCase.source_gallery_file
    });

    if (pendingPromptCases.length >= promptCaseBatchSize) {
      await flushPromptCases();
    }
  }

  await flushPromptCases();

  const localCategorySlugSet = new Set(categories.map((category) => category.slug));
  const { data: existingCategoryRows, error: existingCategoryError } =
    await categoriesTable.select("slug");

  if (existingCategoryError) {
    failWithSupabaseError("Category post-cleanup select", existingCategoryError);
  }

  const staleCategorySlugs = (existingCategoryRows ?? [])
    .map((row) => row.slug)
    .filter((slug) => !localCategorySlugSet.has(slug));

  if (staleCategorySlugs.length > 0) {
    const { error: staleCategoryDeleteError } = await categoriesTable
      .delete()
      .in("slug", staleCategorySlugs);

    if (staleCategoryDeleteError) {
      failWithSupabaseError("Category cleanup delete", staleCategoryDeleteError);
    }
  }

  console.log(
    JSON.stringify(
      {
        categories: categories.length,
        prompt_cases: importedPromptCaseCount,
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
