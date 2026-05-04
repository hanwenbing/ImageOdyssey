import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CaseIndexItem } from "./types";
import {
  createPromptExcerpt,
  parseGalleryMarkdown,
  parseIndexMarkdown,
  type ParsedPromptCase
} from "../scripts/parseGallery";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "..");

export type LocalCaseRecord = ParsedPromptCase & {
  image_storage_path: string;
};

type LocalCorpus = {
  indexItems: CaseIndexItem[];
  casesByNumber: Map<number, LocalCaseRecord>;
};

let cachedCorpus: LocalCorpus | null = null;

function assertCaseAssetExists(localImagePath: string): void {
  const absolutePath = resolve(repoRoot, localImagePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing local image asset: ${localImagePath}`);
  }
}

function readLocalCorpus(): LocalCorpus {
  const indexMarkdown = readFileSync(resolve(repoRoot, "index.md"), "utf8");
  const categories = parseIndexMarkdown(indexMarkdown).sort(
    (left, right) => left.sort_order - right.sort_order
  );

  const casesByNumber = new Map<number, LocalCaseRecord>();
  const indexItems: CaseIndexItem[] = [];

  for (const category of categories) {
    const galleryMarkdown = readFileSync(
      resolve(repoRoot, category.source_gallery_file),
      "utf8"
    );
    const parsedCases = parseGalleryMarkdown(
      category.source_gallery_file,
      category.name,
      galleryMarkdown
    );

    for (const parsedCase of parsedCases) {
      if (casesByNumber.has(parsedCase.case_number)) {
        const prior = casesByNumber.get(parsedCase.case_number);
        throw new Error(
          `Duplicate local case number ${parsedCase.case_number} in ${prior?.source_gallery_file} and ${parsedCase.source_gallery_file}`
        );
      }

      assertCaseAssetExists(parsedCase.local_image_path);

      const localCase: LocalCaseRecord = {
        ...parsedCase,
        image_storage_path: `cases/case${parsedCase.case_number}.jpg`
      };

      casesByNumber.set(parsedCase.case_number, localCase);
      indexItems.push({
        case_number: parsedCase.case_number,
        title: parsedCase.title,
        category_name: parsedCase.category_name,
        summary: parsedCase.summary,
        tags: parsedCase.tags,
        prompt_excerpt: createPromptExcerpt(parsedCase.prompt_text),
        image_storage_path: localCase.image_storage_path
      });
    }
  }

  indexItems.sort((left, right) => left.case_number - right.case_number);

  return { indexItems, casesByNumber };
}

function getCachedCorpus(): LocalCorpus {
  cachedCorpus ??= readLocalCorpus();
  return cachedCorpus;
}

export function loadLocalCaseIndex(): CaseIndexItem[] {
  return getCachedCorpus().indexItems.map((item) => ({ ...item }));
}

export function getLocalCaseByNumber(caseNumber: number): LocalCaseRecord {
  const localCase = getCachedCorpus().casesByNumber.get(caseNumber);
  if (!localCase) {
    throw new Error(`Unknown local case number: ${caseNumber}`);
  }

  return { ...localCase };
}

export function listLocalCaseRecords(): LocalCaseRecord[] {
  return [...getCachedCorpus().casesByNumber.values()]
    .map((localCase) => ({ ...localCase }))
    .sort((left, right) => left.case_number - right.case_number);
}

