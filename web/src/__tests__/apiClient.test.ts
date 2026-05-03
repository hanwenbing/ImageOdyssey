import { describe, expect, it, vi } from "vitest";
import { requestRewrite, requestRecommendations } from "../lib/apiClient";

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
});
