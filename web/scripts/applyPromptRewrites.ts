import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type PromptRewrite = {
  case_number: number;
  rewritten_prompt_text: string;
};

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function assertSafeReplacement(rewrite: PromptRewrite): void {
  const trimmedPrompt = rewrite.rewritten_prompt_text.trim();
  if (
    trimmedPrompt.startsWith("{") ||
    trimmedPrompt.startsWith("[") ||
    trimmedPrompt.startsWith("```")
  ) {
    throw new Error(`unsafe replacement prompt case ${rewrite.case_number}`);
  }
}

function findCaseSection(
  markdown: string,
  caseNumber: number
): { start: number; end: number } | undefined {
  const anchors = Array.from(
    markdown.matchAll(/^\s*<a id="case-(\d+)"><\/a>\s*$/gm)
  );
  const anchorIndex = anchors.findIndex(
    (anchor) => Number(anchor[1]) === caseNumber
  );

  if (anchorIndex === -1) {
    return undefined;
  }

  const start = anchors[anchorIndex].index ?? 0;
  const end =
    anchorIndex + 1 < anchors.length
      ? anchors[anchorIndex + 1].index ?? markdown.length
      : markdown.length;

  return { start, end };
}

export function applyPromptRewritesToMarkdown(
  markdown: string,
  rewrites: PromptRewrite[]
): string {
  let rewrittenMarkdown = markdown;

  for (const rewrite of rewrites) {
    assertSafeReplacement(rewrite);

    const sectionRange = findCaseSection(
      rewrittenMarkdown,
      rewrite.case_number
    );
    if (sectionRange === undefined) {
      throw new Error(`missing replacement target case ${rewrite.case_number}`);
    }

    const section = rewrittenMarkdown.slice(sectionRange.start, sectionRange.end);
    const promptMatch = /(```text[^\S\r\n]*(\r?\n))([\s\S]*?)(\r?\n[^\S\r\n]*```)/.exec(section);
    if (promptMatch === null || promptMatch.index === undefined) {
      throw new Error(`missing replacement target case ${rewrite.case_number}`);
    }

    const replacementPrompt = normalizeLineEndings(
      rewrite.rewritten_prompt_text.trim()
    ).replace(/\n/g, promptMatch[2]);
    const promptStart =
      sectionRange.start + promptMatch.index + promptMatch[1].length;
    const promptEnd = promptStart + promptMatch[3].length;
    rewrittenMarkdown =
      rewrittenMarkdown.slice(0, promptStart) +
      replacementPrompt +
      rewrittenMarkdown.slice(promptEnd);
  }

  return rewrittenMarkdown;
}

const isCli = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (isCli) {
  const rewritesPath = process.argv[2];
  if (rewritesPath === undefined) {
    throw new Error("Usage: tsx scripts/applyPromptRewrites.ts <rewrites.json>");
  }

  const rewritesByFile = JSON.parse(
    readFileSync(resolve(process.cwd(), rewritesPath), "utf8")
  ) as Record<string, PromptRewrite[]>;
  const repoRoot = resolve(process.cwd(), "..");

  for (const [fileName, rewrites] of Object.entries(rewritesByFile)) {
    const markdownPath = resolve(repoRoot, fileName);
    const markdown = readFileSync(markdownPath, "utf8");
    writeFileSync(
      markdownPath,
      applyPromptRewritesToMarkdown(markdown, rewrites),
      "utf8"
    );
  }
}
