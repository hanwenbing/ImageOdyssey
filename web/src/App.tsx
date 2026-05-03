import { useEffect, useMemo, useState } from "react";
import { ImageUploadPanel } from "./components/ImageUploadPanel";
import {
  requestRecommendations,
  requestRewrite,
  saveExperiment,
  toCaseIndexItem,
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

type PromptTab = "original" | "rewrite";

type PromptCaseRow = Omit<PromptCaseWithCategory, "category_name">;

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
      <div className="absolute inset-x-0 bottom-0 bg-zinc-950/92 p-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white">Case {promptCase.case_number}</span>
          <span className="text-[11px] text-zinc-400">{promptCase.category_name}</span>
        </div>
        <div className="mt-1 line-clamp-2 text-sm text-zinc-100">{promptCase.title}</div>
        <div className="mt-2 text-xs text-cyan-200">点击选择</div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-zinc-950/92 p-3 text-left opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white">Case {promptCase.case_number}</span>
          <span className="text-[11px] text-zinc-400">{promptCase.category_name}</span>
        </div>
        <div className="mt-1 line-clamp-2 text-sm text-zinc-100">{promptCase.title}</div>
        <div className="mt-2 text-xs text-cyan-200">点击选择</div>
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
    Boolean(sourceStoragePath) && !sourceUploadBusy && !recommendBusy && filteredCases.length > 0;
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
    if (!canUploadResult || !sourceStoragePath || !selectedCase || !rewriteResult) {
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
    if (!canRecommend || !sourceStoragePath) {
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
        cases: filteredCases.map(toCaseIndexItem)
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
    if (!canRewrite || !sourceStoragePath || !selectedCase) {
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
    <main className="flex min-h-screen flex-col bg-zinc-950 text-zinc-50">
      {errorMessage && (
        <div className="fixed left-4 top-4 z-50 max-w-[min(680px,calc(100vw-2rem))] rounded-lg border border-rose-300/30 bg-rose-950 px-4 py-3 text-sm text-rose-100 shadow-xl">
          {errorMessage}
        </div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col gap-4 p-4 pb-40 xl:grid xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col gap-4">
          <ImageUploadPanel
            title="Source Image"
            helper="上传参考图，推荐和改写都会围绕它展开"
            imageUrl={sourcePreviewUrl}
            busy={sourceUploadBusy}
            onFileSelected={handleSourceSelected}
          />
          <ImageUploadPanel
            title="Result Image"
            helper="完成改写后上传生成结果，系统会自动保存实验记录"
            imageUrl={resultPreviewUrl}
            disabled={!canUploadResult}
            busy={resultUploadBusy}
            onFileSelected={handleResultSelected}
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
                className="h-11 rounded-lg bg-cyan-300 px-4 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                type="button"
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

          <div className="min-h-0 flex-1">
            {galleryLoading ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-zinc-400">
                正在加载 Gallery...
              </div>
            ) : visibleCases.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-zinc-400">
                没有匹配的案例
              </div>
            ) : (
              <div className="grid max-h-full grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3 xl:grid-cols-4">
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
        </section>
      </div>

      <section className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-zinc-950/96 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 px-4 py-4 xl:flex-row xl:items-end xl:gap-4">
          <div className="min-w-0 flex-1">
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
              <span className="min-w-0 truncate text-sm text-zinc-400">
                {selectedCase
                  ? `当前案例：Case ${selectedCase.case_number} · ${selectedCase.title}`
                  : "当前案例：未选择"}
              </span>
            </div>

            <textarea
              className="h-28 w-full resize-none rounded-lg border border-white/10 bg-zinc-950 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none"
              readOnly
              value={promptText}
            />
          </div>

          <button
            className="h-11 rounded-lg bg-cyan-300 px-5 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            type="button"
            disabled={!canRewrite}
            onClick={handleRewrite}
          >
            {rewriteBusy ? "改写中..." : "改写"}
          </button>
        </div>
      </section>
    </main>
  );
}
