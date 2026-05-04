import * as crypto from "node:crypto";

export type WorkflowEventStatus = "started" | "succeeded" | "failed" | "blocked";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type WorkflowEventInsert = {
  request_id: string;
  workflow: string;
  stage: string;
  status: WorkflowEventStatus;
  message: string | null;
  request_payload: JsonValue | null;
  response_payload: JsonValue | null;
  error_payload: JsonValue | null;
  metadata: JsonValue | null;
};

type WorkflowEventsFrom = (table: "workflow_events") => {
  insert: (event: WorkflowEventInsert) => Promise<{ error?: unknown }> | { error?: unknown };
};

export function createRequestId(): string {
  return `wf_${crypto.randomUUID()}`;
}

export function errorPayload(error: unknown): { message: string; name?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name
    };
  }

  return {
    message: String(error)
  };
}

export async function logWorkflowEvent(
  from: WorkflowEventsFrom,
  event: WorkflowEventInsert
): Promise<void> {
  try {
    const { error } = await from("workflow_events").insert(event);
    if (error) {
      console.error("Failed to insert workflow event", {
        error,
        request_id: event.request_id,
        workflow: event.workflow,
        stage: event.stage,
        status: event.status
      });
    }
  } catch (error) {
    console.error("Failed to insert workflow event", {
      error,
      request_id: event.request_id,
      workflow: event.workflow,
      stage: event.stage,
      status: event.status
    });
  }
}
