import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type JsonLikePromptCase = {
  case_number: number;
  source_gallery_file: string;
  prompt_text: string;
  structure: string;
};

function normalizeLineEndings(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n");
}

function hasComplexPlaceholders(promptText: string): boolean {
  return (
    /\{\{[^}]+}}|<[^>\n]+>|\[[^[\]"'{},:\n]+]/.test(promptText) ||
    /\{[^{}\n]*(argument|参数名称|name=|default=)[^{}\n]*}/i.test(promptText)
  );
}

function hasMixedPunctuation(promptText: string): boolean {
  return /[，：；“”‘’]/.test(promptText) || /[{,]\s*[A-Za-z_][\w-]*\s*:/.test(promptText);
}

function hasNestedObject(promptText: string): boolean {
  return /:\s*\{/.test(promptText);
}

export function classifyJsonLikePrompt(promptText: string): string {
  const trimmedPrompt = promptText.trim();

  if (trimmedPrompt.startsWith("[")) {
    return "array_structure";
  }

  if (hasComplexPlaceholders(trimmedPrompt)) {
    return "complex_placeholders";
  }

  if (hasMixedPunctuation(trimmedPrompt)) {
    return "mixed_punctuation";
  }

  if (hasNestedObject(trimmedPrompt)) {
    return "nested_object";
  }

  return "simple_object";
}

export function findJsonLikePromptCasesInMarkdown(
  sourceGalleryFile: string,
  markdown: string
): JsonLikePromptCase[] {
  const normalizedMarkdown = normalizeLineEndings(markdown);
  const promptCases: JsonLikePromptCase[] = [];
  const anchors = Array.from(
    normalizedMarkdown.matchAll(/^\s*<a id="case-(\d+)"><\/a>\s*$/gm)
  );

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const caseNumber = Number(anchor[1]);
    const sectionStart = anchor.index ?? 0;
    const sectionEnd =
      index + 1 < anchors.length
        ? anchors[index + 1].index ?? normalizedMarkdown.length
        : normalizedMarkdown.length;
    const section = normalizedMarkdown.slice(sectionStart, sectionEnd);
    const promptMatch = section.match(/```text\s*\n([\s\S]*?)\n\s*```/);

    if (!promptMatch) {
      continue;
    }

    const promptText = promptMatch[1].trim();
    if (!/^[{[]/.test(promptText)) {
      continue;
    }

    promptCases.push({
      case_number: caseNumber,
      source_gallery_file: sourceGalleryFile,
      prompt_text: promptText,
      structure: classifyJsonLikePrompt(promptText)
    });
  }

  return promptCases;
}

export function scanRepoForJsonLikePrompts(
  repoRoot: string
): JsonLikePromptCase[] {
  return readdirSync(repoRoot)
    .filter((fileName) => /^gallery\d+\.md$/.test(fileName))
    .sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true })
    )
    .flatMap((fileName) => {
      const markdown = readFileSync(resolve(repoRoot, fileName), "utf8");
      return findJsonLikePromptCasesInMarkdown(fileName, markdown);
    });
}

function createCliReport(promptCases: JsonLikePromptCase[]) {
  const byStructure = promptCases.reduce<Record<string, number>>(
    (totals, promptCase) => {
      totals[promptCase.structure] = (totals[promptCase.structure] ?? 0) + 1;
      return totals;
    },
    {}
  );

  return {
    count: promptCases.length,
    by_structure: byStructure,
    samples: promptCases.slice(0, 10).map((promptCase) => ({
      case_number: promptCase.case_number,
      source_gallery_file: promptCase.source_gallery_file,
      structure: promptCase.structure,
      prompt_preview:
        promptCase.prompt_text.length <= 120
          ? promptCase.prompt_text
          : `${promptCase.prompt_text.slice(0, 120)}...`
    }))
  };
}

const isCli = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (isCli) {
  const repoRoot = resolve(process.cwd(), "..");
  const promptCases = scanRepoForJsonLikePrompts(repoRoot);
  process.stdout.write(`${JSON.stringify(createCliReport(promptCases), null, 2)}\n`);
}
