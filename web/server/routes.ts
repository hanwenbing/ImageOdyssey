import cors from "cors";
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import { z } from "zod";
import { recommend as defaultRecommend, rewrite as defaultRewrite } from "./codexBridge";
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

const caseIndexItemSchema = z.object({
  case_number: z.number().int(),
  title: z.string().min(1),
  category_name: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()),
  prompt_excerpt: z.string().min(1),
  image_storage_path: z.string().min(1)
});

const recommendRequestSchema = z.object({
  source_image_storage_path: z.string().min(1),
  user_query: z.string().min(1),
  category_filter: z.string().nullable(),
  cases: z.array(caseIndexItemSchema).min(1)
});

const rewriteRequestSchema = z.object({
  source_image_storage_path: z.string().min(1),
  case_number: z.number().int(),
  original_prompt_text: z.string().min(1)
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

  router.post(
    "/api/recommend",
    toAsyncHandler(async (request, response) => {
      const parsedRequest = recommendRequestSchema.safeParse(request.body);
      if (!parsedRequest.success) {
        response.status(400).json({ error: firstValidationErrorMessage(parsedRequest.error) });
        return;
      }

      response.json(await recommend(parsedRequest.data));
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

      response.json(await rewrite(parsedRequest.data));
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
        handleRouteError(response, error);
        return;
      }

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
      const experimentsTable = client.from("experiments") as unknown as ExperimentInsertChain;
      const { data, error } = await experimentsTable
        .insert(parsedRequest.data as ExperimentInsert)
        .select("id")
        .single();

      if (error) {
        handleRouteError(response, error);
        return;
      }

      if (!data || typeof data.id !== "string") {
        response.status(500).json({ error: "Experiment insert did not return an id" });
        return;
      }

      response.json({ id: data.id });
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
