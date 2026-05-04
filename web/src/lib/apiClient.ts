import type {
  CaseIndexItem,
  RecommendRequest,
  RecommendResponse,
  RewriteRequest,
  RewriteResponse
} from "../../server/types";
import type { ExperimentInsert } from "../types";

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  const trimmedText = text.trim();

  if (trimmedText.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch (error) {
      if (response.ok) {
        throw new Error(
          `Request succeeded but returned invalid JSON: ${trimmedText.slice(0, 200)}`,
          { cause: error }
        );
      }

      throw new Error(trimmedText || `Request failed with status ${response.status}`, {
        cause: error
      });
    }
  } else if (response.ok) {
    throw new Error("Request succeeded but returned invalid JSON: empty response");
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJsonResponse<T>(response);
}

export async function requestRecommendations(
  request: RecommendRequest
): Promise<RecommendResponse["recommendations"]> {
  const response = await postJson<RecommendResponse>("/api/recommend", request);
  return response.recommendations;
}

export async function requestRewrite(request: RewriteRequest): Promise<RewriteResponse> {
  return postJson<RewriteResponse>("/api/rewrite", request);
}

export async function uploadExperimentImage(
  kind: "source" | "result",
  file: File
): Promise<{ storagePath: string }> {
  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("file", file);

  const response = await fetch("/api/experiment-images", {
    method: "POST",
    body: formData
  });

  return parseJsonResponse<{ storagePath: string }>(response);
}

export async function saveExperiment(payload: ExperimentInsert): Promise<{ id: string }> {
  return postJson<{ id: string }>("/api/experiments", payload);
}

export function toCaseIndexItem(promptCase: {
  case_number: number;
  title: string;
  category_name: string;
  summary: string;
  tags: string[];
  prompt_text: string;
  image_storage_path: string;
}): CaseIndexItem {
  const normalizedPrompt = promptCase.prompt_text.replace(/\s+/g, " ").trim();

  return {
    case_number: promptCase.case_number,
    title: promptCase.title,
    category_name: promptCase.category_name,
    summary: promptCase.summary,
    tags: promptCase.tags,
    prompt_excerpt:
      normalizedPrompt.length <= 180
        ? normalizedPrompt
        : `${normalizedPrompt.slice(0, 180)}...`,
    image_storage_path: promptCase.image_storage_path
  };
}
