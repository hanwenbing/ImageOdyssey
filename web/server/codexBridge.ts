import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLocalCaseByNumber,
  type LocalCaseRecord
} from "./localCorpus";
import { resolveSourceImagePath as defaultResolveSourceImagePath } from "./sourceImageCache";
import type {
  CaseIndexItem,
  RecommendRequest,
  RecommendResponse,
  RewriteRequest,
  RewriteResponse
} from "./types";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "..");

type CodexResult = {
  stdout: string;
  stderr: string;
};

type CodexBridgeDependencies = {
  resolveSourceImagePath?: (storagePath: string) => Promise<string>;
};

const expectedRecommendationCount = 6;

function getCodexCommand(): { command: string; argsPrefix: string[] } {
  if (process.platform !== "win32") {
    return { command: "npm", argsPrefix: [] };
  }

  return {
    command: process.execPath,
    argsPrefix: [
      resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    ]
  };
}

function requireNonEmptyString(value: unknown, scope: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${scope} must be a non-empty string`);
  }

  return value.trim();
}

function requireInteger(value: unknown, scope: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value)
  ) {
    throw new Error(`${scope} must be an integer`);
  }

  return value;
}

function normalizeReason(reason: unknown, caseNumber: number): string {
  return requireNonEmptyString(reason, `recommendation reason for case ${caseNumber}`);
}

function extractFirstJsonObject(stdout: string): string | null {
  for (let start = stdout.indexOf("{"); start >= 0; start = stdout.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let index = start; index < stdout.length; index += 1) {
      const character = stdout[index];

      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }

        if (character === "\\") {
          escape = true;
          continue;
        }

        if (character === '"') {
          inString = false;
        }

        continue;
      }

      if (character === '"') {
        inString = true;
        continue;
      }

      if (character === "{") {
        depth += 1;
        continue;
      }

      if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = stdout.slice(start, index + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
              return candidate;
            }
          } catch {
            break;
          }
        }
      }
    }
  }

  return null;
}

function parseJsonObject(scope: string, stdout: string): Record<string, unknown> {
  const jsonText = extractFirstJsonObject(stdout);
  if (!jsonText) {
    throw new Error(`${scope} did not return a valid JSON object`);
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${scope} JSON payload must be an object`);
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${scope} returned invalid JSON: ${message}`, { cause: error });
  }
}

function spawnCodex(prompt: string, imagePath: string): Promise<CodexResult> {
  const { command, argsPrefix } = getCodexCommand();
  const child = spawn(
    command,
    [
      ...argsPrefix,
      "-C",
      "web",
      "exec",
      "codex",
      "--",
      "exec",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "-C",
      repoRoot,
      "-i",
      imagePath
    ],
    {
      cwd: repoRoot,
      windowsHide: true
    }
  );

  child.stdin?.write(prompt);
  child.stdin?.end();

  return new Promise<CodexResult>((resolveResult, rejectResult) => {
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error: Error) => {
      rejectResult(error);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolveResult({ stdout, stderr });
        return;
      }

      const suffix = signal ? `, signal ${signal}` : "";
      const details = stderr.trim();
      rejectResult(
        new Error(
          `Codex command failed with exit code ${code ?? "unknown"}${suffix}${
            details ? `: ${details}` : ""
          }`
        )
      );
    });
  });
}

function buildRecommendPrompt(request: RecommendRequest, cases: CaseIndexItem[]): string {
  return [
    "You are selecting the best local prompt cases for an image-to-prompt rewrite workflow.",
    "Return only one JSON object. Do not wrap it in markdown, code fences, or commentary.",
    'The JSON schema must be {"recommendations":[{"case_number":number,"reason":string}]}.',
    `Choose exactly ${expectedRecommendationCount} recommendations.`,
    "Every case_number must come from the provided cases list.",
    "Every reason must be a non-empty string.",
    "",
    "Request:",
    JSON.stringify(
      {
        source_image_storage_path: request.source_image_storage_path,
        user_query: request.user_query,
        category_filter: request.category_filter,
        cases
      },
      null,
      2
    )
  ].join("\n");
}

function buildRewritePrompt(request: RewriteRequest, caseRecord: LocalCaseRecord): string {
  return [
    "You are rewriting a prompt for a local prompt gallery case.",
    "Return only one JSON object. Do not wrap it in markdown, code fences, or commentary.",
    'The JSON schema must be {"rewritten_prompt_text":string,"preserved_parts":[string],"changed_parts":[string]}.',
    "The rewritten prompt must stay faithful to the original case while adapting to the source image.",
    "The rewritten_prompt_text value must be natural-language Chinese prompt text that can be copied directly into ChatGPT / GPT Image 2.",
    "Do not put JSON, Markdown code fences, key-value objects, or schema-like prompt text inside rewritten_prompt_text.",
    "",
    "Case:",
    JSON.stringify(
      {
        case_number: caseRecord.case_number,
        title: caseRecord.title,
        category_name: caseRecord.category_name,
        summary: caseRecord.summary,
        tags: caseRecord.tags,
        prompt_excerpt: caseRecord.prompt_excerpt,
        source_image_storage_path: request.source_image_storage_path,
        original_prompt_text: request.original_prompt_text
      },
      null,
      2
    )
  ].join("\n");
}

function looksLikeStructuredPromptText(value: string): boolean {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith("```")) {
    return true;
  }

  if (/^(?:\{\s*(?:["{}]|\}|[a-z\u4e00-\u9fff])|\[\s*(?:["{[]|\]))/i.test(trimmedValue)) {
    return true;
  }

  const schemaKeyPattern =
    /(?:^|\n)\s*["“”]?(?:type|subject|style|prompt|layout|theme|background|instruction|主题|主体|风格|构图|布局|背景|提示词|说明)["“”]?\s*[:：=]/i;
  const schemaKeyMatches = trimmedValue.match(new RegExp(schemaKeyPattern, "gi")) ?? [];
  if (schemaKeyMatches.length >= 2) {
    return true;
  }

  const inlineSchemaKeyPattern =
    /["“”]?(?:type|subject|style|prompt|layout|theme|background|instruction|主题|主体|风格|构图|布局|背景|提示词|说明)["“”]?\s*[:：=]/gi;
  const inlineSchemaKeyMatches = trimmedValue.match(inlineSchemaKeyPattern) ?? [];
  if (inlineSchemaKeyMatches.length >= 2) {
    return true;
  }

  const structuredListPattern =
    /(?:^|\n)\s*(?:[-*•]|\d+[.)、])\s*(?:type|subject|style|prompt|layout|theme|background|instruction|主题|主体|风格|构图|布局|背景|提示词|说明)(?=\s|[:：=]|$)/i;
  const structuredListMatches =
    trimmedValue.match(new RegExp(structuredListPattern, "gi")) ?? [];
  if (structuredListMatches.length >= 2) {
    return true;
  }

  const genericListMatches =
    trimmedValue.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)、])\s+\S+/g) ?? [];
  if (genericListMatches.length >= 2) {
    return true;
  }

  return /^"?(?:type|subject|style|prompt|layout|theme|background|instruction)"?\s*[:=]/i.test(
    trimmedValue
  ) || /^(?:主题|主体|风格|构图|布局|背景|说明)\s*[:：=]/.test(trimmedValue);
}

function validateRequestedCases(requestCases: CaseIndexItem[]): number[] {
  if (!Array.isArray(requestCases) || requestCases.length === 0) {
    throw new Error("recommend request must include at least one case");
  }

  if (requestCases.length < expectedRecommendationCount) {
    throw new Error(
      `recommend request must include at least ${expectedRecommendationCount} cases`
    );
  }

  const allowedCaseNumbers: number[] = [];
  const seenCaseNumbers = new Set<number>();
  for (const caseItem of requestCases) {
    const caseNumber = requireInteger(caseItem.case_number, "case_number");
    if (seenCaseNumbers.has(caseNumber)) {
      throw new Error(`recommend request includes duplicate case number: ${caseNumber}`);
    }

    seenCaseNumbers.add(caseNumber);
    allowedCaseNumbers.push(caseNumber);
  }

  for (const caseNumber of allowedCaseNumbers) {
    getLocalCaseByNumber(caseNumber);
  }

  return allowedCaseNumbers;
}

function getRequestedLocalCases(caseNumbers: number[]): LocalCaseRecord[] {
  return caseNumbers.map((caseNumber) => getLocalCaseByNumber(caseNumber));
}

function parseRecommendationResponse(
  response: Record<string, unknown>,
  allowedCaseNumbers: Set<number>
): RecommendResponse {
  const rawRecommendations = response.recommendations;
  if (!Array.isArray(rawRecommendations)) {
    throw new Error("recommend: expected recommendations array");
  }

  if (rawRecommendations.length !== expectedRecommendationCount) {
    throw new Error(
      `recommend: expected exactly ${expectedRecommendationCount} recommendations`
    );
  }

  const recommendations: RecommendResponse["recommendations"] = [];
  const seenCaseNumbers = new Set<number>();

  for (const rawRecommendation of rawRecommendations) {
    if (rawRecommendation === null || typeof rawRecommendation !== "object" || Array.isArray(rawRecommendation)) {
      throw new Error("recommend: every recommendation must be an object");
    }

    const caseNumber = requireInteger(
      (rawRecommendation as { case_number?: unknown }).case_number,
      "recommendation case_number"
    );
    if (!allowedCaseNumbers.has(caseNumber)) {
      throw new Error(`recommend: invalid case_number ${caseNumber}`);
    }

    if (seenCaseNumbers.has(caseNumber)) {
      throw new Error(`recommend: duplicate case_number ${caseNumber}`);
    }

    const reason = normalizeReason(
      (rawRecommendation as { reason?: unknown }).reason,
      caseNumber
    );

    recommendations.push({ case_number: caseNumber, reason });
    seenCaseNumbers.add(caseNumber);
  }

  return { recommendations };
}

function parseRewriteResponse(response: Record<string, unknown>): RewriteResponse {
  const rewrittenPromptText = requireNonEmptyString(
    response.rewritten_prompt_text,
    "rewritten_prompt_text"
  );

  if (looksLikeStructuredPromptText(rewrittenPromptText)) {
    throw new Error("rewritten_prompt_text must be natural-language prompt text");
  }

  const preservedParts = response.preserved_parts;
  const changedParts = response.changed_parts;

  if (!Array.isArray(preservedParts) || !Array.isArray(changedParts)) {
    throw new Error("rewrite: expected preserved_parts and changed_parts arrays");
  }

  return {
    rewritten_prompt_text: rewrittenPromptText,
    preserved_parts: preservedParts.map((part, index) =>
      requireNonEmptyString(part, `preserved_parts[${index}]`)
    ),
    changed_parts: changedParts.map((part, index) =>
      requireNonEmptyString(part, `changed_parts[${index}]`)
    )
  };
}

export async function recommend(
  request: RecommendRequest,
  dependencies: CodexBridgeDependencies = {}
): Promise<RecommendResponse> {
  const allowedCaseNumbers = validateRequestedCases(request.cases);
  const canonicalCases = getRequestedLocalCases(allowedCaseNumbers);
  const resolveSourceImagePath =
    dependencies.resolveSourceImagePath ?? defaultResolveSourceImagePath;
  const sourceImagePath = await resolveSourceImagePath(request.source_image_storage_path);

  const { stdout } = await spawnCodex(
    buildRecommendPrompt(request, canonicalCases),
    sourceImagePath
  );
  const parsed = parseJsonObject("recommend", stdout);
  return parseRecommendationResponse(parsed, new Set(allowedCaseNumbers));
}

export async function rewrite(
  request: RewriteRequest,
  dependencies: CodexBridgeDependencies = {}
): Promise<RewriteResponse> {
  const caseRecord = getLocalCaseByNumber(request.case_number);
  const resolveSourceImagePath =
    dependencies.resolveSourceImagePath ?? defaultResolveSourceImagePath;
  const sourceImagePath = await resolveSourceImagePath(request.source_image_storage_path);
  const { stdout } = await spawnCodex(
    buildRewritePrompt(request, caseRecord),
    sourceImagePath
  );
  const parsed = parseJsonObject("rewrite", stdout);
  return parseRewriteResponse(parsed);
}
