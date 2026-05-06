import cors from "cors";
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import { z } from "zod";
import { recommend as defaultRecommend, rewrite as defaultRewrite } from "./maasBridge";
import {
  createRequestId,
  errorPayload,
  logWorkflowEvent,
  type JsonValue,
  type WorkflowEventInsert
} from "./workflowEvents";
import type {
  RecommendRequest,
  RecommendResponse,
  RewriteRequest,
  RewriteResponse
} from "./types";
import { getServiceRoleClient as defaultGetServiceRoleClient } from "./supabase";
import type { ExperimentInsert } from "../src/types";

type RouteDependencies = {
  recommend?: (request: RecommendRequest) => Promise<RecommendResponse>;
  rewrite?: (request: RewriteRequest) => Promise<RewriteResponse>;
  getServiceRoleClient?: typeof defaultGetServiceRoleClient;
};

type ExperimentInsertResult = {
  data: {
    id: string;
  } | null;
  error: unknown;
};

type ExperimentInsertSelect = {
  single: () => Promise<ExperimentInsertResult>;
};

type ExperimentInsertChain = {
  insert: (values: ExperimentInsert) => {
    select: (columns: string) => ExperimentInsertSelect;
  };
};

const recommendRequestSchema = z.object({
  source_image_storage_path: z.string().min(1),
  user_query: z.string(),
  category_filter: z.string().nullable(),
  case_numbers: z.array(z.number().int()).min(6)
});

const rewriteRequestSchema = z.object({
  source_image_storage_path: z.string().min(1),
  case_number: z.number().int(),
  original_prompt_text: z.string().min(1)
});

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (valueType === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }

  return false;
}

const jsonValueSchema = z.custom<JsonValue>(isJsonValue, {
  message: "Expected JSON-compatible value"
});

const frontendWorkflowEventSchema = z.object({
  request_id: z.string().min(1),
  workflow: z.literal("frontend"),
  stage: z.enum([
    "recommend_blocked",
    "rewrite_blocked",
    "result_upload_blocked",
    "api_error"
  ]),
  status: z.enum(["failed", "blocked"]),
  message: z.string().nullable(),
  request_payload: jsonValueSchema.nullable(),
  response_payload: jsonValueSchema.nullable(),
  error_payload: jsonValueSchema.nullable(),
  metadata: jsonValueSchema.nullable()
});

const experimentInsertSchema = z.object({
  source_image_storage_path: z.string().min(1),
  result_image_storage_path: z.string().min(1),
  prompt_case_id: z.string().min(1),
  original_prompt_text: z.string().min(1),
  rewritten_prompt_text: z.string().min(1),
  recommendation_query: z.string().nullable()
});

const multipartUploadSchema = z.object({
  kind: z.enum(["source", "result"])
});

const upload = multer({
  storage: multer.memoryStorage()
});

const allowedCorsOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstValidationErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request";
}

function sanitizeUploadFileName(fileName: string): string {
  const normalized = fileName
    .replace(/[\\/]/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "");

  return normalized.length > 0 ? normalized : "upload.bin";
}

function handleRouteError(
  response: express.Response,
  error: unknown,
  statusCode = 500
): void {
  response.status(statusCode).json({ error: errorMessage(error) });
}

function toAsyncHandler(
  handler: express.RequestHandler
): express.RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function createRouter(dependencies: RouteDependencies = {}) {
  const router = express.Router();
  const recommend = dependencies.recommend ?? defaultRecommend;
  const rewrite = dependencies.rewrite ?? defaultRewrite;
  const getServiceRoleClient =
    dependencies.getServiceRoleClient ?? defaultGetServiceRoleClient;

  async function writeWorkflowEvent(event: WorkflowEventInsert): Promise<void> {
    const client = getServiceRoleClient();
    await logWorkflowEvent(client.from.bind(client) as never, event);
  }

  function buildWorkflowEvent(
    requestId: string,
    workflow: string,
    stage: string,
    status: WorkflowEventInsert["status"],
    details: Omit<
      WorkflowEventInsert,
      "request_id" | "workflow" | "stage" | "status"
    >
  ): WorkflowEventInsert {
    return {
      request_id: requestId,
      workflow,
      stage,
      status,
      ...details
    };
  }

  router.post(
    "/api/recommend",
    toAsyncHandler(async (request, response) => {
      const parsedRequest = recommendRequestSchema.safeParse(request.body);
      if (!parsedRequest.success) {
        response.status(400).json({ error: firstValidationErrorMessage(parsedRequest.error) });
        return;
      }

      const requestId = createRequestId();
      await writeWorkflowEvent(
        buildWorkflowEvent(requestId, "recommend", "request_received", "started", {
          message: null,
          request_payload: parsedRequest.data,
          response_payload: null,
          error_payload: null,
          metadata: null
        })
      );

      try {
        const recommendation = await recommend(parsedRequest.data);
        await writeWorkflowEvent(
          buildWorkflowEvent(requestId, "recommend", "response_sent", "succeeded", {
            message: null,
            request_payload: parsedRequest.data,
            response_payload: recommendation,
            error_payload: null,
            metadata: null
          })
        );
        response.json(recommendation);
      } catch (error) {
        await writeWorkflowEvent(
          buildWorkflowEvent(requestId, "recommend", "route_error", "failed", {
            message: errorMessage(error),
            request_payload: parsedRequest.data,
            response_payload: null,
            error_payload: errorPayload(error),
            metadata: null
          })
        );
        handleRouteError(response, error);
      }
    })
  );

  router.post(
    "/api/rewrite",
    toAsyncHandler(async (request, response) => {
      const parsedRequest = rewriteRequestSchema.safeParse(request.body);
      if (!parsedRequest.success) {
        response.status(400).json({ error: firstValidationErrorMessage(parsedRequest.error) });
        return;
      }

      const requestId = createRequestId();
      await writeWorkflowEvent(
        buildWorkflowEvent(requestId, "rewrite", "request_received", "started", {
          message: null,
          request_payload: parsedRequest.data,
          response_payload: null,
          error_payload: null,
          metadata: null
        })
      );

      try {
        const rewrittenPrompt = await rewrite(parsedRequest.data);
        await writeWorkflowEvent(
          buildWorkflowEvent(requestId, "rewrite", "response_sent", "succeeded", {
            message: null,
            request_payload: parsedRequest.data,
            response_payload: rewrittenPrompt,
            error_payload: null,
            metadata: null
          })
        );
        response.json(rewrittenPrompt);
      } catch (error) {
        await writeWorkflowEvent(
          buildWorkflowEvent(requestId, "rewrite", "route_error", "failed", {
            message: errorMessage(error),
            request_payload: parsedRequest.data,
            response_payload: null,
            error_payload: errorPayload(error),
            metadata: null
          })
        );
        handleRouteError(response, error);
      }
    })
  );

  router.post(
    "/api/experiment-images",
    upload.single("file"),
    toAsyncHandler(async (request, response) => {
      const parsedBody = multipartUploadSchema.safeParse(request.body);
      if (!parsedBody.success) {
        response.status(400).json({ error: firstValidationErrorMessage(parsedBody.error) });
        return;
      }

      if (!request.file) {
        response.status(400).json({ error: "file is required" });
        return;
      }

      const client = getServiceRoleClient();
      const requestId = createRequestId();
      await writeWorkflowEvent(
        buildWorkflowEvent(requestId, "experiment-images", "request_received", "started", {
          message: null,
          request_payload: {
            kind: parsedBody.data.kind,
            fileName: request.file.originalname
          },
          response_payload: null,
          error_payload: null,
          metadata: null
        })
      );
      const storagePath = `${parsedBody.data.kind}/${crypto.randomUUID()}-${sanitizeUploadFileName(
        request.file.originalname
      )}`;

      const { error } = await client.storage.from("experiment-images").upload(
        storagePath,
        request.file.buffer,
        {
          contentType: request.file.mimetype,
          upsert: false
        }
      );

      if (error) {
        await writeWorkflowEvent(
          buildWorkflowEvent(requestId, "experiment-images", "route_error", "failed", {
            message: errorMessage(error),
            request_payload: {
              kind: parsedBody.data.kind,
              fileName: request.file.originalname
            },
            response_payload: null,
            error_payload: errorPayload(error),
            metadata: null
          })
        );
        handleRouteError(response, error);
        return;
      }

      await writeWorkflowEvent(
        buildWorkflowEvent(requestId, "experiment-images", "storage_uploaded", "succeeded", {
          message: null,
          request_payload: {
            kind: parsedBody.data.kind,
            fileName: request.file.originalname
          },
          response_payload: { storagePath },
          error_payload: null,
          metadata: null
        })
      );
      response.json({ storagePath });
    })
  );

  router.post(
    "/api/experiments",
    toAsyncHandler(async (request, response) => {
      const parsedRequest = experimentInsertSchema.safeParse(request.body);
      if (!parsedRequest.success) {
        response.status(400).json({ error: firstValidationErrorMessage(parsedRequest.error) });
        return;
      }

      const client = getServiceRoleClient();
      const requestId = createRequestId();
      await writeWorkflowEvent(
        buildWorkflowEvent(requestId, "experiments", "request_received", "started", {
          message: null,
          request_payload: parsedRequest.data,
          response_payload: null,
          error_payload: null,
          metadata: null
        })
      );
      const experimentsTable = client.from("experiments") as unknown as ExperimentInsertChain;
      const { data, error } = await experimentsTable
        .insert(parsedRequest.data as ExperimentInsert)
        .select("id")
        .single();

      if (error) {
        await writeWorkflowEvent(
          buildWorkflowEvent(requestId, "experiments", "route_error", "failed", {
            message: errorMessage(error),
            request_payload: parsedRequest.data,
            response_payload: null,
            error_payload: errorPayload(error),
            metadata: null
          })
        );
        handleRouteError(response, error);
        return;
      }

      if (!data || typeof data.id !== "string") {
        const routeError = new Error("Experiment insert did not return an id");
        await writeWorkflowEvent(
          buildWorkflowEvent(requestId, "experiments", "route_error", "failed", {
            message: routeError.message,
            request_payload: parsedRequest.data,
            response_payload: null,
            error_payload: errorPayload(routeError),
            metadata: null
          })
        );
        response.status(500).json({ error: routeError.message });
        return;
      }

      await writeWorkflowEvent(
        buildWorkflowEvent(requestId, "experiments", "insert_succeeded", "succeeded", {
          message: null,
          request_payload: parsedRequest.data,
          response_payload: { id: data.id },
          error_payload: null,
          metadata: null
        })
      );
      response.json({ id: data.id });
    })
  );

  router.post(
    "/api/workflow-events",
    toAsyncHandler(async (request, response) => {
      const parsedRequest = frontendWorkflowEventSchema.safeParse(request.body);
      if (!parsedRequest.success) {
        response.status(400).json({ error: firstValidationErrorMessage(parsedRequest.error) });
        return;
      }

      await writeWorkflowEvent(parsedRequest.data);
      response.json({ ok: true });
    })
  );

  router.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      next: express.NextFunction
    ) => {
      void next;
      if (error instanceof multer.MulterError) {
        handleRouteError(response, error, 400);
        return;
      }

      handleRouteError(response, error);
    }
  );

  return router;
}

export function createApp(dependencies: RouteDependencies = {}) {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedCorsOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      }
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(createRouter(dependencies));

  return app;
}
