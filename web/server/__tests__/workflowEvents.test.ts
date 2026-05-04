import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRequestId,
  errorPayload,
  logWorkflowEvent,
  type WorkflowEventInsert
} from "../workflowEvents";

describe("workflowEvents", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("createRequestId returns non-empty workflow ids and each call differs", () => {
    const first = createRequestId();
    const second = createRequestId();

    expect(first).toMatch(/^wf_[a-f0-9-]+$/);
    expect(second).toMatch(/^wf_[a-f0-9-]+$/);
    expect(first).not.toBe("");
    expect(second).not.toBe("");
    expect(first).not.toBe(second);
  });

  it("logWorkflowEvent inserts the event into workflow_events via the provided from function", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const event: WorkflowEventInsert = {
      request_id: "wf_123",
      workflow: "gallery-import",
      stage: "queue",
      status: "started",
      message: "started",
      request_payload: { source: "gallery" },
      response_payload: null,
      error_payload: null,
      metadata: { attempt: 1 }
    };

    await expect(logWorkflowEvent(from, event)).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith("workflow_events");
    expect(insert).toHaveBeenCalledWith(event);
  });

  it("logWorkflowEvent accepts succeeded events", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const event: WorkflowEventInsert = {
      request_id: "wf_123",
      workflow: "gallery-import",
      stage: "complete",
      status: "succeeded",
      message: "succeeded",
      request_payload: null,
      response_payload: { ok: true },
      error_payload: null,
      metadata: null
    };

    await expect(logWorkflowEvent(from, event)).resolves.toBeUndefined();

    expect(insert).toHaveBeenCalledWith(event);
  });

  it("logWorkflowEvent does not throw when insert returns an error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const insert = vi.fn().mockResolvedValue({ error: new Error("insert failed") });
    const from = vi.fn().mockReturnValue({ insert });

    await expect(
      logWorkflowEvent(from, {
        request_id: "wf_123",
        workflow: "gallery-import",
        stage: "queue",
        status: "failed",
        message: "failed",
        request_payload: null,
        response_payload: null,
        error_payload: { message: "boom" },
        metadata: null
      })
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to insert workflow event",
      expect.objectContaining({
        request_id: "wf_123",
        workflow: "gallery-import",
        stage: "queue",
        status: "failed"
      })
    );
  });

  it("logWorkflowEvent does not throw when from or insert throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const from = vi.fn().mockImplementation(() => {
      throw new Error("from failed");
    });

    await expect(
      logWorkflowEvent(from, {
        request_id: "wf_123",
        workflow: "gallery-import",
        stage: "queue",
        status: "blocked",
        message: "blocked",
        request_payload: null,
        response_payload: null,
        error_payload: null,
        metadata: null
      })
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to insert workflow event",
      expect.objectContaining({
        request_id: "wf_123",
        workflow: "gallery-import",
        stage: "queue",
        status: "blocked"
      })
    );
  });

  it("logWorkflowEvent does not throw when insert throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const insert = vi.fn().mockImplementation(() => {
      throw new Error("insert failed");
    });
    const from = vi.fn().mockReturnValue({ insert });

    await expect(
      logWorkflowEvent(from, {
        request_id: "wf_123",
        workflow: "gallery-import",
        stage: "queue",
        status: "failed",
        message: "failed",
        request_payload: null,
        response_payload: null,
        error_payload: { message: "boom" },
        metadata: null
      })
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to insert workflow event",
      expect.objectContaining({
        request_id: "wf_123",
        workflow: "gallery-import",
        stage: "queue",
        status: "failed"
      })
    );
  });

  it("errorPayload converts Error and non-Error values", () => {
    expect(errorPayload(new TypeError("bad type"))).toEqual({
      message: "bad type",
      name: "TypeError"
    });
    expect(errorPayload("plain failure")).toEqual({
      message: "plain failure"
    });
  });
});
