// @vitest-environment node

import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecommendRequest, RecommendResponse, RewriteRequest, RewriteResponse } from "../types";
import type { WorkflowEventInsert } from "../workflowEvents";
import { createApp } from "../routes";

function createServiceRoleClientMock(options: {
  uploadResult?: { data: { path: string } | null; error: unknown };
  experimentResult?: { data: { id: string } | null; error: unknown };
} = {}) {
  const workflowInsert = vi.fn().mockResolvedValue({ error: null });
  const upload = vi.fn().mockResolvedValue(
    options.uploadResult ?? { data: { path: "source/upload.png" }, error: null }
  );
  const storageFrom = vi.fn().mockReturnValue({ upload });
  const experimentSingle = vi.fn().mockResolvedValue(
    options.experimentResult ?? { data: { id: "experiment-1" }, error: null }
  );
  const experimentSelect = vi.fn().mockReturnValue({ single: experimentSingle });
  const experimentInsert = vi.fn().mockReturnValue({ select: experimentSelect });
  const from = vi.fn((table: string) => {
    if (table === "workflow_events") {
      return { insert: workflowInsert };
    }

    if (table === "experiments") {
      return { insert: experimentInsert };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: {
      storage: { from: storageFrom },
      from
    },
    workflowInsert,
    upload,
    storageFrom,
    experimentInsert,
    experimentSelect,
    experimentSingle
  };
}

function workflowEventsFromCalls(insert: ReturnType<typeof vi.fn>): WorkflowEventInsert[] {
  return insert.mock.calls.map(([event]) => event as WorkflowEventInsert);
}

function createServerUrl(app: ReturnType<typeof createApp>) {
  const server = createServer(app);

  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Failed to start test server");
      }

      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          })
      });
    });
  });
}

async function requestJson(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown
) {
  const server = await createServerUrl(app);
  try {
    const response = await fetch(`${server.url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    return {
      response,
      json: () => response.json() as Promise<Record<string, unknown>>
    };
  } finally {
    await server.close();
  }
}

async function requestMultipart(
  app: ReturnType<typeof createApp>,
  path: string,
  formData: FormData
) {
  const server = await createServerUrl(app);
  try {
    const response = await fetch(`${server.url}${path}`, {
      method: "POST",
      body: formData
    });

    return {
      response,
      json: () => response.json() as Promise<Record<string, unknown>>
    };
  } finally {
    await server.close();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API routes", () => {
  it("only allows local Vite origins through CORS", async () => {
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn()
    });
    const server = await createServerUrl(app);

    try {
      const allowedResponse = await fetch(`${server.url}/api/recommend`, {
        method: "OPTIONS",
        headers: {
          origin: "http://127.0.0.1:5173",
          "access-control-request-method": "POST"
        }
      });
      const blockedResponse = await fetch(`${server.url}/api/recommend`, {
        method: "OPTIONS",
        headers: {
          origin: "https://example.com",
          "access-control-request-method": "POST"
        }
      });

      expect(allowedResponse.headers.get("access-control-allow-origin")).toBe(
        "http://127.0.0.1:5173"
      );
      expect(blockedResponse.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await server.close();
    }
  });

  it("forwards recommend requests to codexBridge and returns JSON", async () => {
    const serviceRoleClient = createServiceRoleClientMock();
    const recommend = vi.fn(async (request: RecommendRequest): Promise<RecommendResponse> => {
      void request;
      return {
        recommendations: [{ case_number: 7, reason: "closest fit" }]
      };
    });
    const rewrite = vi.fn(async (request: RewriteRequest): Promise<RewriteResponse> => {
      void request;
      return {
        rewritten_prompt_text: "",
        preserved_parts: [],
        changed_parts: []
      };
    });
    const app = createApp({
      recommend,
      rewrite,
      getServiceRoleClient: vi.fn().mockReturnValue(serviceRoleClient.client)
    });
    const payload = {
      source_image_storage_path: "source/path.jpg",
      user_query: "match the closest cases",
      category_filter: null,
      cases: [
        {
          case_number: 7,
          title: "Case 7",
          category_name: "Portrait",
          summary: "Summary",
          tags: ["portrait"],
          prompt_excerpt: "Excerpt",
          image_storage_path: "cases/case7.jpg"
        }
      ]
    };

    const { response, json } = await requestJson(app, "/api/recommend", payload);

    expect(response.status).toBe(200);
    expect(await json()).toEqual({
      recommendations: [{ case_number: 7, reason: "closest fit" }]
    });
    expect(recommend).toHaveBeenCalledWith(payload);
    expect(serviceRoleClient.workflowInsert).toHaveBeenCalledTimes(2);

    const [startedEvent, succeededEvent] = workflowEventsFromCalls(serviceRoleClient.workflowInsert);
    expect(startedEvent).toMatchObject({
      workflow: "recommend",
      stage: "request_received",
      status: "started",
      request_payload: payload,
      response_payload: null,
      error_payload: null,
      metadata: null
    });
    expect(succeededEvent).toMatchObject({
      workflow: "recommend",
      stage: "response_sent",
      status: "succeeded",
      request_payload: payload,
      response_payload: {
        recommendations: [{ case_number: 7, reason: "closest fit" }]
      },
      error_payload: null,
      metadata: null
    });
    expect(startedEvent.request_id).toBe(succeededEvent.request_id);
  });

  it("returns a 400 error for invalid recommend requests", async () => {
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn()
    });

    const { response, json } = await requestJson(app, "/api/recommend", {
      source_image_storage_path: "",
      user_query: "match the closest cases",
      category_filter: null,
      cases: []
    });

    expect(response.status).toBe(400);
    expect(await json()).toEqual({
      error: expect.any(String)
    });
  });

  it("returns a 500 error and logs failure when recommend rejects", async () => {
    const serviceRoleClient = createServiceRoleClientMock();
    const recommend = vi.fn().mockRejectedValue(new Error("recommend exploded"));
    const app = createApp({
      recommend,
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue(serviceRoleClient.client)
    });
    const payload = {
      source_image_storage_path: "source/path.jpg",
      user_query: "match the closest cases",
      category_filter: null,
      cases: [
        {
          case_number: 7,
          title: "Case 7",
          category_name: "Portrait",
          summary: "Summary",
          tags: ["portrait"],
          prompt_excerpt: "Excerpt",
          image_storage_path: "cases/case7.jpg"
        }
      ]
    };

    const { response, json } = await requestJson(app, "/api/recommend", payload);

    expect(response.status).toBe(500);
    expect(await json()).toEqual({
      error: "recommend exploded"
    });
    expect(serviceRoleClient.workflowInsert).toHaveBeenCalledTimes(2);

    const [startedEvent, failedEvent] = workflowEventsFromCalls(serviceRoleClient.workflowInsert);
    expect(startedEvent).toMatchObject({
      workflow: "recommend",
      stage: "request_received",
      status: "started",
      request_payload: payload,
      response_payload: null,
      error_payload: null,
      metadata: null
    });
    expect(failedEvent).toMatchObject({
      workflow: "recommend",
      stage: "route_error",
      status: "failed",
      request_payload: payload,
      response_payload: null,
      error_payload: {
        message: "recommend exploded",
        name: "Error"
      },
      metadata: null
    });
    expect(startedEvent.request_id).toBe(failedEvent.request_id);
  });

  it("forwards rewrite requests to codexBridge and returns JSON", async () => {
    const serviceRoleClient = createServiceRoleClientMock();
    const rewrite = vi.fn(async (request: RewriteRequest): Promise<RewriteResponse> => {
      void request;
      return {
        rewritten_prompt_text: "Rewritten prompt",
        preserved_parts: ["subject", "lighting"],
        changed_parts: ["composition"]
      };
    });
    const recommend = vi.fn(async (request: RecommendRequest): Promise<RecommendResponse> => {
      void request;
      return {
        recommendations: []
      };
    });
    const app = createApp({
      recommend,
      rewrite,
      getServiceRoleClient: vi.fn().mockReturnValue(serviceRoleClient.client)
    });
    const payload = {
      source_image_storage_path: "source/path.jpg",
      case_number: 7,
      original_prompt_text: "Original prompt"
    };

    const { response, json } = await requestJson(app, "/api/rewrite", payload);

    expect(response.status).toBe(200);
    expect(await json()).toEqual({
      rewritten_prompt_text: "Rewritten prompt",
      preserved_parts: ["subject", "lighting"],
      changed_parts: ["composition"]
    });
    expect(rewrite).toHaveBeenCalledWith(payload);
    expect(serviceRoleClient.workflowInsert).toHaveBeenCalledTimes(2);

    const [startedEvent, succeededEvent] = workflowEventsFromCalls(serviceRoleClient.workflowInsert);
    expect(startedEvent).toMatchObject({
      workflow: "rewrite",
      stage: "request_received",
      status: "started",
      request_payload: payload,
      response_payload: null,
      error_payload: null,
      metadata: null
    });
    expect(succeededEvent).toMatchObject({
      workflow: "rewrite",
      stage: "response_sent",
      status: "succeeded",
      request_payload: payload,
      response_payload: {
        rewritten_prompt_text: "Rewritten prompt",
        preserved_parts: ["subject", "lighting"],
        changed_parts: ["composition"]
      },
      error_payload: null,
      metadata: null
    });
    expect(startedEvent.request_id).toBe(succeededEvent.request_id);
  });

  it("returns a 400 error for invalid rewrite requests", async () => {
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn()
    });

    const { response, json } = await requestJson(app, "/api/rewrite", {
      source_image_storage_path: "",
      case_number: 0,
      original_prompt_text: ""
    });

    expect(response.status).toBe(400);
    expect(await json()).toEqual({
      error: expect.any(String)
    });
  });

  it("returns a 500 error and logs failure when rewrite rejects", async () => {
    const serviceRoleClient = createServiceRoleClientMock();
    const rewrite = vi.fn().mockRejectedValue(new Error("rewrite exploded"));
    const app = createApp({
      recommend: vi.fn(),
      rewrite,
      getServiceRoleClient: vi.fn().mockReturnValue(serviceRoleClient.client)
    });
    const payload = {
      source_image_storage_path: "source/path.jpg",
      case_number: 7,
      original_prompt_text: "Original prompt"
    };

    const { response, json } = await requestJson(app, "/api/rewrite", payload);

    expect(response.status).toBe(500);
    expect(await json()).toEqual({
      error: "rewrite exploded"
    });
    expect(serviceRoleClient.workflowInsert).toHaveBeenCalledTimes(2);

    const [startedEvent, failedEvent] = workflowEventsFromCalls(serviceRoleClient.workflowInsert);
    expect(startedEvent).toMatchObject({
      workflow: "rewrite",
      stage: "request_received",
      status: "started",
      request_payload: payload,
      response_payload: null,
      error_payload: null,
      metadata: null
    });
    expect(failedEvent).toMatchObject({
      workflow: "rewrite",
      stage: "route_error",
      status: "failed",
      request_payload: payload,
      response_payload: null,
      error_payload: {
        message: "rewrite exploded",
        name: "Error"
      },
      metadata: null
    });
    expect(startedEvent.request_id).toBe(failedEvent.request_id);
  });

  it("writes workflow events through Supabase and returns ok", async () => {
    const serviceRoleClient = createServiceRoleClientMock();
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue(serviceRoleClient.client)
    });
    const payload = {
      request_id: "wf_123",
      workflow: "frontend",
      stage: "recommend_blocked",
      status: "blocked",
      message: null,
      request_payload: { source: "gallery" },
      response_payload: null,
      error_payload: null,
      metadata: { attempt: 1 }
    };

    const { response, json } = await requestJson(app, "/api/workflow-events", payload);

    expect(response.status).toBe(200);
    expect(await json()).toEqual({ ok: true });
    expect(serviceRoleClient.workflowInsert).toHaveBeenCalledWith(payload);
  });

  it("returns a 400 error for invalid workflow event payloads", async () => {
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn()
    });

    const { response, json } = await requestJson(app, "/api/workflow-events", {
      workflow: "frontend"
    });

    expect(response.status).toBe(400);
    expect(await json()).toEqual({
      error: expect.any(String)
    });
  });

  it("rejects non-frontend workflow event writes", async () => {
    const serviceRoleClient = createServiceRoleClientMock();
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue(serviceRoleClient.client)
    });

    const { response, json } = await requestJson(app, "/api/workflow-events", {
      request_id: "wf_123",
      workflow: "recommend",
      stage: "request_received",
      status: "started",
      message: null,
      request_payload: null,
      response_payload: null,
      error_payload: null,
      metadata: null
    });

    expect(response.status).toBe(400);
    expect(await json()).toEqual({
      error: expect.any(String)
    });
    expect(serviceRoleClient.workflowInsert).not.toHaveBeenCalled();
  });

  it("uploads an experiment image to Supabase storage", async () => {
    const serviceRoleClient = createServiceRoleClientMock();
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue(serviceRoleClient.client)
    });
    const formData = new FormData();
    formData.append("kind", "source");
    formData.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "../source image.png", { type: "image/png" })
    );

    const { response, json } = await requestMultipart(app, "/api/experiment-images", formData);

    expect(response.status).toBe(200);
    const body = await json();
    expect(typeof body.storagePath).toBe("string");
    expect(String(body.storagePath)).toMatch(/^source\/[0-9a-f-]+-source_image\.png$/i);
    expect(serviceRoleClient.upload).toHaveBeenCalledTimes(1);
    expect(serviceRoleClient.workflowInsert).toHaveBeenCalledTimes(2);
    const [startedEvent, succeededEvent] = workflowEventsFromCalls(serviceRoleClient.workflowInsert);
    expect(startedEvent).toMatchObject({
      workflow: "experiment-images",
      stage: "request_received",
      status: "started"
    });
    expect(succeededEvent).toMatchObject({
      workflow: "experiment-images",
      stage: "storage_uploaded",
      status: "succeeded"
    });
  });

  it("returns a 400 error when experiment image upload is missing a file", async () => {
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn()
    });
    const formData = new FormData();
    formData.append("kind", "source");

    const { response, json } = await requestMultipart(app, "/api/experiment-images", formData);

    expect(response.status).toBe(400);
    expect(await json()).toEqual({
      error: expect.stringContaining("file")
    });
  });

  it("returns a 400 error when experiment image upload has an invalid kind", async () => {
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn()
    });
    const formData = new FormData();
    formData.append("kind", "preview");
    formData.append("file", new File([new Uint8Array([1])], "image.png", { type: "image/png" }));

    const { response, json } = await requestMultipart(app, "/api/experiment-images", formData);

    expect(response.status).toBe(400);
    expect(await json()).toEqual({
      error: expect.any(String)
    });
  });

  it("returns a 500 error when experiment image upload fails", async () => {
    const serviceRoleClient = createServiceRoleClientMock({
      uploadResult: {
        data: null,
        error: new Error("upload failed")
      }
    });
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue(serviceRoleClient.client)
    });
    const formData = new FormData();
    formData.append("kind", "result");
    formData.append("file", new File([new Uint8Array([1])], "image.png", { type: "image/png" }));

    const { response, json } = await requestMultipart(app, "/api/experiment-images", formData);

    expect(response.status).toBe(500);
    expect(await json()).toEqual({
      error: expect.stringContaining("upload failed")
    });
    expect(serviceRoleClient.workflowInsert).toHaveBeenCalledTimes(2);
    const [startedEvent, failedEvent] = workflowEventsFromCalls(serviceRoleClient.workflowInsert);
    expect(startedEvent).toMatchObject({
      workflow: "experiment-images",
      stage: "request_received",
      status: "started"
    });
    expect(failedEvent).toMatchObject({
      workflow: "experiment-images",
      stage: "route_error",
      status: "failed",
      error_payload: {
        message: "upload failed",
        name: "Error"
      }
    });
  });

  it("inserts experiments with Supabase service role", async () => {
    const serviceRoleClient = createServiceRoleClientMock();
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue(serviceRoleClient.client)
    });

    const payload = {
      source_image_storage_path: "source/path.jpg",
      result_image_storage_path: "result/path.jpg",
      prompt_case_id: "case-1",
      original_prompt_text: "Original prompt",
      rewritten_prompt_text: "Rewritten prompt",
      recommendation_query: null
    };

    const { response, json } = await requestJson(app, "/api/experiments", payload);

    expect(response.status).toBe(200);
    expect(await json()).toEqual({ id: "experiment-1" });
    expect(serviceRoleClient.workflowInsert).toHaveBeenCalledTimes(2);
    const [startedEvent, succeededEvent] = workflowEventsFromCalls(serviceRoleClient.workflowInsert);
    expect(startedEvent).toMatchObject({
      workflow: "experiments",
      stage: "request_received",
      status: "started"
    });
    expect(succeededEvent).toMatchObject({
      workflow: "experiments",
      stage: "insert_succeeded",
      status: "succeeded"
    });
    expect(serviceRoleClient.experimentInsert).toHaveBeenCalledWith(payload);
  });

  it("returns a 400 error for invalid experiment inserts", async () => {
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn()
    });

    const { response, json } = await requestJson(app, "/api/experiments", {
      source_image_storage_path: "",
      result_image_storage_path: "result/path.jpg",
      prompt_case_id: "case-1",
      original_prompt_text: "Original prompt",
      rewritten_prompt_text: "Rewritten prompt",
      recommendation_query: null
    });

    expect(response.status).toBe(400);
    expect(await json()).toEqual({
      error: expect.any(String)
    });
  });

  it("returns a 500 error when experiment insert fails", async () => {
    const serviceRoleClient = createServiceRoleClientMock({
      experimentResult: {
        data: null,
        error: new Error("insert failed")
      }
    });
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue(serviceRoleClient.client)
    });

    const { response, json } = await requestJson(app, "/api/experiments", {
      source_image_storage_path: "source/path.jpg",
      result_image_storage_path: "result/path.jpg",
      prompt_case_id: "case-1",
      original_prompt_text: "Original prompt",
      rewritten_prompt_text: "Rewritten prompt",
      recommendation_query: "query"
    });

    expect(response.status).toBe(500);
    expect(await json()).toEqual({
      error: expect.stringContaining("insert failed")
    });
    expect(serviceRoleClient.workflowInsert).toHaveBeenCalledTimes(2);
    const [startedEvent, failedEvent] = workflowEventsFromCalls(serviceRoleClient.workflowInsert);
    expect(startedEvent).toMatchObject({
      workflow: "experiments",
      stage: "request_received",
      status: "started"
    });
    expect(failedEvent).toMatchObject({
      workflow: "experiments",
      stage: "route_error",
      status: "failed",
      error_payload: {
        message: "insert failed",
        name: "Error"
      }
    });
  });
});
