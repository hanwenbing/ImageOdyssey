import type {
  RecommendRequest,
  RecommendResponse,
  RewriteRequest,
  RewriteResponse
} from "../../server/types";
import type { ExperimentInsert } from "../types";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ClientWorkflowEvent = {
  request_id: string;
  workflow: "frontend";
  stage: "recommend_blocked" | "rewrite_blocked" | "result_upload_blocked" | "api_error";
  status: "failed" | "blocked";
  message: string | null;
  request_payload: JsonValue | null;
  response_payload: JsonValue | null;
  error_payload: JsonValue | null;
  metadata: JsonValue | null;
};

function normalizeFetchError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error("本地 API 未连接。请运行 run-web-dev.cmd 或 npm -C web run dev:all。", {
      cause: error
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}

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
  const body = JSON.stringify(payload);
  const response = await (async () => {
    try {
      return await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body
      });
    } catch (error) {
      throw normalizeFetchError(error);
    }
  })();

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

  const response = await (async () => {
    try {
      return await fetch("/api/experiment-images", {
        method: "POST",
        body: formData
      });
    } catch (error) {
      throw normalizeFetchError(error);
    }
  })();

  return parseJsonResponse<{ storagePath: string }>(response);
}

export async function saveExperiment(payload: ExperimentInsert): Promise<{ id: string }> {
  return postJson<{ id: string }>("/api/experiments", payload);
}

export async function logWorkflowEvent(event: ClientWorkflowEvent): Promise<void> {
  await postJson<{ ok: true }>("/api/workflow-events", event);
}
