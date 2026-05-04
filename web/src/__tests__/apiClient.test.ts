import { describe, expect, it, vi } from "vitest";
import {
  logWorkflowEvent,
  requestRewrite,
  requestRecommendations,
  uploadExperimentImage
} from "../lib/apiClient";

describe("apiClient", () => {
  it("uses plain text from non-JSON error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("upstream failed", {
          status: 502,
          headers: { "content-type": "text/plain" }
        })
      )
    );

    await expect(
      requestRecommendations({
        source_image_storage_path: "source/path.png",
        user_query: "test",
        category_filter: null,
        cases: []
      })
    ).rejects.toThrow("upstream failed");
  });

  it("translates fetch rejection into an actionable Chinese connection error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );

    await expect(
      requestRecommendations({
        source_image_storage_path: "source/path.png",
        user_query: "test",
        category_filter: null,
        cases: []
      })
    ).rejects.toThrow(
      "本地 API 未连接。请运行 run-web-dev.cmd 或 npm -C web run dev:all。"
    );
  });

  it("translates upload fetch rejection into an actionable Chinese connection error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );

    await expect(
      uploadExperimentImage(
        "source",
        new File(["image"], "source.png", { type: "image/png" })
      )
    ).rejects.toThrow(
      "本地 API 未连接。请运行 run-web-dev.cmd 或 npm -C web run dev:all。"
    );
  });

  it("preserves local payload serialization errors", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(
      requestRecommendations(circular as never)
    ).rejects.toThrow(/circular structure/i);
  });

  it("throws an explicit error when a successful response is not valid json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("plain text body", {
          status: 200,
          headers: { "content-type": "text/plain" }
        })
      )
    );

    await expect(
      requestRewrite({
        source_image_storage_path: "source/path.png",
        case_number: 1,
        original_prompt_text: "prompt"
      })
    ).rejects.toThrow("Request succeeded but returned invalid JSON");
  });

  it("posts workflow events and resolves on ok true", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(_input).toBe("/api/workflow-events");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "content-type": "application/json" });
      expect(init?.body).toBe(
        JSON.stringify({
          request_id: "req-1",
          workflow: "frontend",
          stage: "recommend_blocked",
          status: "blocked",
          message: null,
          request_payload: { foo: "bar" },
          response_payload: null,
          error_payload: null,
          metadata: { attempt: 1 }
        })
      );

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      logWorkflowEvent({
        request_id: "req-1",
        workflow: "frontend",
        stage: "recommend_blocked",
        status: "blocked",
        message: null,
        request_payload: { foo: "bar" },
        response_payload: null,
        error_payload: null,
        metadata: { attempt: 1 }
      })
    ).resolves.toBeUndefined();
  });

  it("propagates server error messages from workflow events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "workflow logging failed" }), {
          status: 500,
          headers: { "content-type": "application/json" }
        })
      )
    );

    await expect(
      logWorkflowEvent({
        request_id: "req-1",
        workflow: "frontend",
        stage: "api_error",
        status: "failed",
        message: "boom",
        request_payload: null,
        response_payload: null,
        error_payload: { reason: "boom" },
        metadata: null
      })
    ).rejects.toThrow("workflow logging failed");
  });
});
