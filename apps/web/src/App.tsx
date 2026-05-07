import type { Category, PromptCase, RewriteResponse } from "@imageodyssey/shared";
import { useEffect, useMemo, useState } from "react";
import { requestCategories, requestPromptCases, requestRewrite } from "./lib/apiClient";

const featuredLabel = "精选";
const allLabel = "全部";

function CaseCard({
  promptCase,
  selected,
  lazy,
  onImageSettled,
  onSelect
}: {
  promptCase: PromptCase;
  selected: boolean;
  lazy: boolean;
  onImageSettled?: () => void;
  onSelect: (promptCase: PromptCase) => void;
}) {
  return (
    <button
      aria-label={`Case ${promptCase.case_number} ${promptCase.title}`}
      className={`overflow-hidden rounded-lg border bg-white text-left shadow-sm transition ${
        selected ? "border-teal-600 ring-2 ring-teal-600/20" : "border-stone-200 hover:border-teal-500"
      }`}
      type="button"
      onClick={() => onSelect(promptCase)}
    >
      <div className="aspect-[4/3] bg-stone-200">
        <img
          className="h-full w-full object-cover"
          src={promptCase.image_path}
          alt={`Case ${promptCase.case_number} ${promptCase.title}`}
          loading={lazy ? "lazy" : "eager"}
          onLoad={onImageSettled}
          onError={onImageSettled}
        />
      </div>
      <div className="grid gap-2 p-3">
        <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
          <span>{promptCase.category_name}</span>
          <span>#{promptCase.case_number}</span>
        </div>
        <div className="text-sm font-semibold text-stone-950">{promptCase.title}</div>
        <p className="line-clamp-2 text-xs leading-5 text-stone-600">{promptCase.summary}</p>
      </div>
    </button>
  );
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredCases, setFeaturedCases] = useState<PromptCase[]>([]);
  const [allCases, setAllCases] = useState<PromptCase[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(featuredLabel);
  const [selectedCase, setSelectedCase] = useState<PromptCase | null>(null);
  const [rewriteResult, setRewriteResult] = useState<RewriteResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [settledFeaturedImages, setSettledFeaturedImages] = useState(new Set<number>());

  useEffect(() => {
    let cancelled = false;

    async function loadInitialGallery() {
      try {
        const [nextCategories, nextFeaturedCases] = await Promise.all([
          requestCategories(),
          requestPromptCases("featured")
        ]);
        if (!cancelled) {
          setCategories(nextCategories);
          setFeaturedCases(nextFeaturedCases);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(formatErrorMessage(error));
        }
      }
    }

    void loadInitialGallery();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (featuredCases.length > 0 && settledFeaturedImages.size >= featuredCases.length && allCases === null) {
      void requestPromptCases("all")
        .then(setAllCases)
        .catch((error) => setErrorMessage(formatErrorMessage(error)));
    }
  }, [allCases, featuredCases.length, settledFeaturedImages.size]);

  const casesForCurrentCategory = useMemo(() => {
    const sourceCases = selectedCategory === featuredLabel ? featuredCases : allCases ?? featuredCases;
    if (selectedCategory === featuredLabel || selectedCategory === allLabel) {
      return sourceCases;
    }
    return sourceCases.filter((promptCase) => promptCase.category_name === selectedCategory);
  }, [allCases, featuredCases, selectedCategory]);

  async function handleRewrite() {
    if (!selectedCase || rewriteBusy) {
      return;
    }
    setRewriteBusy(true);
    setErrorMessage(null);
    try {
      setRewriteResult(
        await requestRewrite({
          case_number: selectedCase.case_number,
          original_prompt_text: selectedCase.prompt_text
        })
      );
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setRewriteBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 pb-72 text-stone-950">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 px-6 py-4 backdrop-blur">
        <h1 className="text-xl font-bold">ImageOdyssey Prompt Gallery</h1>
        <p className="text-sm text-stone-600">浏览案例，改写成适合搭配 ChatGPT 上传人物照片使用的中文 Prompt</p>
      </header>

      {errorMessage && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <section className="mx-auto grid max-w-7xl gap-4 px-6 py-5">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => (
            <button
              key={category.slug}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${
                selectedCategory === category.name
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-stone-300 bg-white text-stone-700"
              }`}
              type="button"
              onClick={() => setSelectedCategory(category.name)}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {casesForCurrentCategory.map((promptCase) => (
            <CaseCard
              key={promptCase.id}
              promptCase={promptCase}
              selected={selectedCase?.id === promptCase.id}
              lazy={selectedCategory !== featuredLabel}
              onImageSettled={
                selectedCategory === featuredLabel
                  ? () =>
                      setSettledFeaturedImages((prior) => {
                        const next = new Set(prior);
                        next.add(promptCase.case_number);
                        return next;
                      })
                  : undefined
              }
              onSelect={(nextCase) => {
                setSelectedCase(nextCase);
                setRewriteResult(null);
              }}
            />
          ))}
        </div>
      </section>

      <aside className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white px-6 py-4 shadow-2xl">
        <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <section className="rounded-lg border border-stone-200 p-3">
            <h2 className="text-sm font-semibold text-stone-500">原始 Prompt</h2>
            <p className="mt-2 max-h-32 overflow-y-auto text-sm leading-6">
              {selectedCase?.prompt_text ?? "先选择一个案例后，这里会显示原始 Prompt。"}
            </p>
          </section>
          <section className="rounded-lg border border-stone-200 p-3">
            <h2 className="text-sm font-semibold text-stone-500">改写 Prompt</h2>
            <p className="mt-2 max-h-32 overflow-y-auto text-sm leading-6">
              {rewriteResult?.rewritten_prompt_text ?? "点击“改写为图片主体版本”后，这里会显示改写后的 Prompt。"}
            </p>
          </section>
          <div className="grid content-start gap-2">
            <button
              className="rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:bg-stone-300"
              type="button"
              disabled={!selectedCase || rewriteBusy}
              onClick={handleRewrite}
            >
              {rewriteBusy ? "改写中..." : "改写为图片主体版本"}
            </button>
            <button
              className="rounded-lg border border-stone-300 px-4 py-3 text-sm font-semibold text-stone-700 disabled:text-stone-300"
              type="button"
              disabled={!rewriteResult}
              onClick={() => {
                if (rewriteResult) {
                  void navigator.clipboard.writeText(rewriteResult.rewritten_prompt_text);
                }
              }}
            >
              复制改写 Prompt
            </button>
          </div>
        </div>
      </aside>
    </main>
  );
}
