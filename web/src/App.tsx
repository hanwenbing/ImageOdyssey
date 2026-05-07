import { useEffect, useMemo, useRef, useState } from "react";
import { ImageUploadPanel } from "./components/ImageUploadPanel";
import {
  requestRecommendations,
  requestRewrite,
  saveExperiment,
  logWorkflowEvent,
  uploadExperimentImage
} from "./lib/apiClient";
import {
  allCategoriesLabel,
  filterCases,
  sortRecommendedCases
} from "./lib/galleryFilters";
import { getSupabaseClient } from "./lib/supabaseClient";
import type {
  Category,
  PromptCaseWithCategory,
  RewriteResult
} from "./types";
import type { ClientWorkflowEvent } from "./lib/apiClient";

type PromptTab = "original" | "rewrite";
type BlockedWorkflowStage = Extract<
  ClientWorkflowEvent["stage"],
  "recommend_blocked" | "rewrite_blocked" | "result_upload_blocked"
>;

type PromptCaseRow = Omit<PromptCaseWithCategory, "category_name">;

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createWorkflowRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `frontend-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function CaseCard({
  promptCase,
  recommended,
  selected,
  onSelect
}: {
  promptCase: PromptCaseWithCategory;
  recommended: boolean;
  selected: boolean;
  onSelect: (promptCase: PromptCaseWithCategory) => void;
}) {
  return (
    <button
      aria-label={`Case ${promptCase.case_number} ${promptCase.title}`}
      className={`group relative aspect-[4/5] overflow-hidden rounded-lg border text-left transition ${
        selected
          ? "border-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
          : "border-white/10 hover:border-cyan-300/60"
      }`}
      type="button"
      onClick={() => onSelect(promptCase)}
    >
      <img
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        src={promptCase.image_public_url}
        alt={`Case ${promptCase.case_number} ${promptCase.title}`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/20 to-transparent" />
      {recommended && (
        <span className="absolute left-2 top-2 rounded-md bg-cyan-300 px-2 py-1 text-[11px] font-semibold text-zinc-950">
          推荐
        </span>
      )}
      <div
        data-testid={`case-card-compact-${promptCase.case_number}`}
        className="absolute inset-x-0 bottom-0 bg-zinc-950/80 p-3 text-left transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white">Case {promptCase.case_number}</span>
        </div>
        <div className="mt-1 line-clamp-2 text-sm text-zinc-100">{promptCase.title}</div>
      </div>
      <div
        data-testid={`case-card-overlay-${promptCase.case_number}`}
        className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-zinc-950/72 p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Case {promptCase.case_number}</span>
          {recommended && (
            <span className="rounded bg-cyan-300 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-950">
              推荐
            </span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-zinc-300">{promptCase.category_name}</div>
        <div className="mt-1 line-clamp-2 text-sm text-zinc-100">{promptCase.title}</div>
        <div className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-300">
          {promptCase.summary}
        </div>
        {promptCase.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {promptCase.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 text-xs text-cyan-200">
          {recommended ? "推荐候选 · 点击选择" : "点击选择"}
        </div>
      </div>
    </button>
  );
}

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [cases, setCases] = useState<PromptCaseWithCategory[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(allCategoriesLabel);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [recommendedCaseNumbers, setRecommendedCaseNumbers] = useState<number[]>([]);
  const [recommendationQuery, setRecommendationQuery] = useState<string | null>(null);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [activePromptTab, setActivePromptTab] = useState<PromptTab>("original");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [sourceStoragePath, setSourceStoragePath] = useState<string | null>(null);
  const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null);
  const [sourceUploadBusy, setSourceUploadBusy] = useState(false);
  const [resultUploadBusy, setResultUploadBusy] = useState(false);
  const [recommendBusy, setRecommendBusy] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [promptDrawerOpen, setPromptDrawerOpen] = useState(false);
  const galleryScrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGallery() {
      try {
        const supabase = getSupabaseClient();
        const [
          { data: categoryRows, error: categoryError },
          { data: promptCaseRows, error: promptCaseError }
        ] = await Promise.all([
          supabase
            .from("categories")
            .select("id, slug, name, sort_order, source_gallery_file")
            .order("sort_order"),
          supabase
            .from("prompt_cases")
            .select(
              "id, case_number, title, category_id, prompt_text, image_storage_path, image_public_url, summary, tags, source_gallery_file, created_at, updated_at"
            )
            .order("case_number")
        ]);

        if (cancelled) {
          return;
        }

        if (categoryError) {
          throw categoryError;
        }

        if (promptCaseError) {
          throw promptCaseError;
        }

        const loadedCategories = (categoryRows ?? []) as Category[];
        const categoryNameById = new Map(
          loadedCategories.map((category) => [category.id, category.name])
        );

        const promptCaseRowsLoaded = (promptCaseRows ?? []) as PromptCaseRow[];
        const loadedCases: PromptCaseWithCategory[] = promptCaseRowsLoaded.map(
          (promptCase) => ({
            ...promptCase,
            category_name: categoryNameById.get(promptCase.category_id) ?? "未分类"
          })
        );

        setCategories(loadedCategories);
        setCases(loadedCases);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(formatErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setGalleryLoading(false);
        }
      }
    }

    void loadGallery();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (sourcePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(sourcePreviewUrl);
      }
    };
  }, [sourcePreviewUrl]);

  useEffect(() => {
    return () => {
      if (resultPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(resultPreviewUrl);
      }
    };
  }, [resultPreviewUrl]);

  useEffect(() => {
    if (galleryScrollContainerRef.current) {
      galleryScrollContainerRef.current.scrollTop = 0;
    }
  }, [query, selectedCategory]);

  const selectedCase = useMemo(
    () => cases.find((promptCase) => promptCase.id === selectedCaseId) ?? null,
    [cases, selectedCaseId]
  );

  const filteredCases = useMemo(
    () => filterCases(cases, query, selectedCategory),
    [cases, query, selectedCategory]
  );

  const visibleCases = useMemo(
    () => sortRecommendedCases(filteredCases, recommendedCaseNumbers),
    [filteredCases, recommendedCaseNumbers]
  );

  const categoryChips = useMemo(
    () => [allCategoriesLabel, ...categories.map((category) => category.name)],
    [categories]
  );

  const canRecommend =
    Boolean(sourceStoragePath) && !sourceUploadBusy && !recommendBusy && filteredCases.length >= 6;
  const canRewrite =
    Boolean(sourceStoragePath) &&
    Boolean(selectedCase) &&
    !sourceUploadBusy &&
    !recommendBusy &&
    !rewriteBusy;
  const canUploadResult =
    Boolean(sourceStoragePath) &&
    Boolean(selectedCase) &&
    Boolean(rewriteResult) &&
    !sourceUploadBusy &&
    !recommendBusy &&
    !rewriteBusy &&
    !resultUploadBusy;

  function workflowStateMetadata() {
    return {
      sourceUploaded: Boolean(sourceStoragePath),
      sourceUploadBusy,
      resultUploadBusy,
      recommendBusy,
      rewriteBusy,
      selectedCaseId,
      selectedCaseNumber: selectedCase?.case_number ?? null,
      hasRewriteResult: Boolean(rewriteResult),
      filteredCaseCount: filteredCases.length,
      selectedCategory,
      query
    };
  }

  function logBlockedWorkflowEvent(stage: BlockedWorkflowStage, message: string) {
    void logWorkflowEvent({
      request_id: createWorkflowRequestId(),
      workflow: "frontend",
      stage,
      status: "blocked",
      message,
      request_payload: {
        action: stage.replace("_blocked", "")
      },
      response_payload: null,
      error_payload: null,
      metadata: workflowStateMetadata()
    }).catch((error) => {
      console.warn("Failed to log blocked workflow event", error);
    });
  }

  function describeRecommendBlockedReason(): string | null {
    if (sourceUploadBusy) {
      return "Source Image 正在上传，完成后再推荐。";
    }
    if (!sourceStoragePath) {
      return "请先上传 Source Image，再获取推荐。";
    }
    if (recommendBusy) {
      return "推荐正在进行中。";
    }
    if (filteredCases.length === 0) {
      return "当前筛选下没有可用于推荐的案例。";
    }

    if (filteredCases.length < 6) {
      return "当前筛选结果少于 6 个候选案例，无法获取推荐。";
    }

    return null;
  }

  function describeRewriteBlockedReason(): string | null {
    if (sourceUploadBusy) {
      return "Source Image 正在上传，完成后再改写。";
    }
    if (!sourceStoragePath) {
      return "请先上传 Source Image，再改写 Prompt。";
    }
    if (!selectedCase) {
      return "请先选择一个案例，再改写 Prompt。";
    }
    if (recommendBusy) {
      return "推荐正在进行中，完成后再改写。";
    }
    if (rewriteBusy) {
      return "改写正在进行中。";
    }

    return null;
  }

  function describeResultUploadBlockedReason(): string | null {
    if (sourceUploadBusy) {
      return "Source Image 正在上传，完成后再上传 Result Image。";
    }
    if (!sourceStoragePath) {
      return "请先上传 Source Image，再上传 Result Image。";
    }
    if (!selectedCase) {
      return "请先选择一个案例，再上传 Result Image。";
    }
    if (!rewriteResult) {
      return "请先完成 Prompt 改写，再上传 Result Image。";
    }
    if (recommendBusy || rewriteBusy || resultUploadBusy) {
      return "当前操作正在进行中，完成后再上传 Result Image。";
    }

    return null;
  }

  function handleBlockedAction(stage: BlockedWorkflowStage, message: string) {
    setErrorMessage(message);
    logBlockedWorkflowEvent(stage, message);
  }

  async function handleSourceSelected(file: File) {
    setErrorMessage(null);
    setSourceUploadBusy(true);
    setSourcePreviewUrl(URL.createObjectURL(file));
    setSourceStoragePath(null);
    setResultPreviewUrl(null);
    setSelectedCaseId(null);
    setRecommendedCaseNumbers([]);
    setRecommendationQuery(null);
    setRewriteResult(null);
    setActivePromptTab("original");

    try {
      const { storagePath } = await uploadExperimentImage("source", file);
      setSourceStoragePath(storagePath);
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setSourceUploadBusy(false);
    }
  }

  async function handleResultSelected(file: File) {
    const blockedReason = describeResultUploadBlockedReason();
    if (blockedReason || !sourceStoragePath || !selectedCase || !rewriteResult) {
      handleBlockedAction(
        "result_upload_blocked",
        blockedReason ?? "当前状态不能上传 Result Image。"
      );
      return;
    }

    setErrorMessage(null);
    setResultUploadBusy(true);
    setResultPreviewUrl(URL.createObjectURL(file));

    try {
      const { storagePath } = await uploadExperimentImage("result", file);
      await saveExperiment({
        source_image_storage_path: sourceStoragePath,
        result_image_storage_path: storagePath,
        prompt_case_id: selectedCase.id,
        original_prompt_text: selectedCase.prompt_text,
        rewritten_prompt_text: rewriteResult.rewritten_prompt_text,
        recommendation_query: recommendationQuery
      });
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setResultUploadBusy(false);
    }
  }

  async function handleRecommend() {
    const blockedReason = describeRecommendBlockedReason();
    if (blockedReason || !sourceStoragePath) {
      handleBlockedAction(
        "recommend_blocked",
        blockedReason ?? "当前状态不能获取推荐。"
      );
      return;
    }

    setErrorMessage(null);
    setRecommendBusy(true);

    try {
      const recommendations = await requestRecommendations({
        source_image_storage_path: sourceStoragePath,
        user_query: query,
        category_filter:
          selectedCategory === allCategoriesLabel ? null : selectedCategory,
        case_numbers: filteredCases.map((promptCase) => promptCase.case_number)
      });

      setRecommendationQuery(query.trim().length > 0 ? query : null);
      setRecommendedCaseNumbers(recommendations.map((item) => item.case_number));
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setRecommendBusy(false);
    }
  }

  async function handleRewrite() {
    const blockedReason = describeRewriteBlockedReason();
    if (blockedReason || !sourceStoragePath || !selectedCase) {
      handleBlockedAction("rewrite_blocked", blockedReason ?? "当前状态不能改写 Prompt。");
      return;
    }

    setErrorMessage(null);
    setRewriteBusy(true);

    try {
      const result = await requestRewrite({
        source_image_storage_path: sourceStoragePath,
        case_number: selectedCase.case_number,
        original_prompt_text: selectedCase.prompt_text
      });

      setRewriteResult(result);
      setActivePromptTab("rewrite");
      setPromptDrawerOpen(true);
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setRewriteBusy(false);
    }
  }

  const promptText =
    activePromptTab === "original"
      ? selectedCase?.prompt_text ?? "先选择一个案例后，这里会显示原始 Prompt。"
      : rewriteResult?.rewritten_prompt_text ?? "点击“改写”后，这里会显示改写后的 Prompt。";

  return (
    <main className="h-screen overflow-hidden bg-zinc-950 text-zinc-50">
      {errorMessage && (
        <div className="fixed left-4 top-4 z-50 max-w-[min(680px,calc(100vw-2rem))] rounded-lg border border-rose-300/30 bg-rose-950 px-4 py-3 text-sm text-rose-100 shadow-xl">
          {errorMessage}
        </div>
      )}

      <div className="mx-auto grid h-full min-h-0 w-full max-w-[1800px] grid-rows-[auto_minmax(0,1fr)] gap-4 p-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:grid-rows-1">
        <section className="grid min-h-0 gap-4 sm:grid-cols-2 xl:flex xl:flex-col">
          <ImageUploadPanel
            title="Source Image"
            imageUrl={sourcePreviewUrl}
            busy={sourceUploadBusy}
            onFileSelected={handleSourceSelected}
          />
          <ImageUploadPanel
            title="Result Image"
            imageUrl={resultPreviewUrl}
            disabled={!canUploadResult}
            busy={resultUploadBusy}
            onFileSelected={handleResultSelected}
            onBlockedSelect={() => {
              const blockedReason = describeResultUploadBlockedReason();
              if (blockedReason) {
                handleBlockedAction("result_upload_blocked", blockedReason);
              }
            }}
          />
        </section>

        <section className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-4 flex flex-col gap-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                aria-label="Search cases"
                className="h-11 min-w-0 rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-300"
                placeholder="搜索 case_number / title / tags / category / summary / prompt"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              <button
                className={`h-11 rounded-lg px-4 text-sm font-semibold ${
                  canRecommend
                    ? "bg-cyan-300 text-zinc-950"
                    : "cursor-not-allowed bg-zinc-800 text-zinc-500"
                }`}
                type="button"
                aria-disabled={!canRecommend}
                disabled={!canRecommend}
                onClick={handleRecommend}
              >
                {recommendBusy ? "推荐中..." : "推荐"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {categoryChips.map((category) => {
                const active = selectedCategory === category;
                return (
                  <button
                    key={category}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-cyan-300 bg-cyan-300 text-zinc-950"
                        : "border-white/10 bg-zinc-950 text-zinc-300 hover:border-cyan-300/50 hover:text-white"
                    }`}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            data-testid="gallery-scroll-container"
            ref={galleryScrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto pr-1"
          >
            {galleryLoading ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-zinc-400">
                正在加载 Gallery...
              </div>
            ) : visibleCases.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-zinc-400">
                没有匹配的案例
              </div>
            ) : (
              <div
                data-testid="gallery-grid"
                className="grid content-start grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
              >
                {visibleCases.map((promptCase) => (
                  <CaseCard
                    key={promptCase.id}
                    promptCase={promptCase}
                    recommended={recommendedCaseNumbers.includes(promptCase.case_number)}
                    selected={selectedCaseId === promptCase.id}
                    onSelect={(nextCase) => {
                      setSelectedCaseId(nextCase.id);
                      setRewriteResult(null);
                      setResultPreviewUrl(null);
                      setActivePromptTab("original");
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 shrink-0 rounded-lg border border-white/10 bg-zinc-950/80">
            <div className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center">
              <button
                className="h-9 rounded-lg border border-white/10 px-3 text-sm font-semibold text-zinc-100 hover:border-cyan-300/50"
                type="button"
                aria-expanded={promptDrawerOpen}
                onClick={() => setPromptDrawerOpen((open) => !open)}
              >
                {promptDrawerOpen ? "收起 Prompt" : "展开 Prompt"}
              </button>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-400">
                {selectedCase
                  ? `当前案例：Case ${selectedCase.case_number} · ${selectedCase.title}`
                  : "当前案例：未选择"}
              </span>
              <button
                className={`h-9 rounded-lg px-4 text-sm font-semibold ${
                  canRewrite
                    ? "bg-cyan-300 text-zinc-950"
                    : "cursor-not-allowed bg-zinc-800 text-zinc-500"
                }`}
                type="button"
                aria-disabled={!canRewrite}
                onClick={handleRewrite}
              >
                {rewriteBusy ? "改写中..." : "改写"}
              </button>
            </div>

            {promptDrawerOpen && (
              <div className="border-t border-white/10 p-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      activePromptTab === "original"
                        ? "bg-cyan-300 text-zinc-950"
                        : "bg-white/10 text-zinc-300 hover:bg-white/15"
                    }`}
                    type="button"
                    onClick={() => setActivePromptTab("original")}
                  >
                    原始 Prompt
                  </button>
                  <button
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      activePromptTab === "rewrite"
                        ? "bg-cyan-300 text-zinc-950"
                        : "bg-white/10 text-zinc-300 hover:bg-white/15"
                    }`}
                    type="button"
                    onClick={() => setActivePromptTab("rewrite")}
                  >
                    改写 Prompt
                  </button>
                </div>

                <textarea
                  className="h-32 w-full resize-none rounded-lg border border-white/10 bg-zinc-950 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none"
                  readOnly
                  value={promptText}
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
