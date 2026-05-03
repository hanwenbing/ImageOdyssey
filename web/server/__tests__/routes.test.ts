// @vitest-environment node

import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecommendRequest, RecommendResponse, RewriteRequest, RewriteResponse } from "../types";
import { createApp } from "../routes";

type MockSupabaseClient = {
  storage: {
    from: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
};

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
    const getServiceRoleClient = vi.fn();
    const app = createApp({ recommend, rewrite, getServiceRoleClient });
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

  it("forwards rewrite requests to codexBridge and returns JSON", async () => {
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
      getServiceRoleClient: vi.fn()
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

  it("uploads an experiment image to Supabase storage", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "source/upload.png" }, error: null });
    const from = vi.fn().mockReturnValue({ upload });
    const supabaseClient: MockSupabaseClient = {
      storage: { from },
      from
    };
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue(supabaseClient)
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
    expect(upload).toHaveBeenCalledTimes(1);
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
    const upload = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("upload failed")
    });
    const from = vi.fn().mockReturnValue({ upload });
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue({
        storage: { from },
        from
      })
    });
    const formData = new FormData();
    formData.append("kind", "result");
    formData.append("file", new File([new Uint8Array([1])], "image.png", { type: "image/png" }));

    const { response, json } = await requestMultipart(app, "/api/experiment-images", formData);

    expect(response.status).toBe(500);
    expect(await json()).toEqual({
      error: expect.stringContaining("upload failed")
    });
  });

  it("inserts experiments with Supabase service role", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "experiment-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue({ from })
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
    expect(insert).toHaveBeenCalledWith(payload);
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
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("insert failed")
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({
      select
    });
    const from = vi.fn().mockReturnValue({ insert });
    const app = createApp({
      recommend: vi.fn(),
      rewrite: vi.fn(),
      getServiceRoleClient: vi.fn().mockReturnValue({ from })
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
  });
});
