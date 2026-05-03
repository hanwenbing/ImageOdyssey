import { describe, expect, it } from "vitest";
import {
  allCategoriesLabel,
  filterCases,
  sortRecommendedCases
} from "../lib/galleryFilters";
import type { PromptCaseWithCategory } from "../types";

const cases: PromptCaseWithCategory[] = [
  {
    id: "1",
    case_number: 1,
    title: "街头海报",
    category_id: "cat-1",
    category_name: "UI与界面",
    prompt_text: "生成一个带有标题的海报",
    image_storage_path: "cases/case1.jpg",
    image_public_url: "https://example.com/case1.jpg",
    summary: "适合品牌视觉",
    tags: ["海报", "界面"],
    source_gallery_file: "gallery1.md",
    created_at: "2026-05-02T00:00:00Z",
    updated_at: "2026-05-02T00:00:00Z"
  },
  {
    id: "2",
    case_number: 2,
    title: "信息图",
    category_id: "cat-2",
    category_name: "图表与信息可视化",
    prompt_text: "做一张知识结构图",
    image_storage_path: "cases/case2.jpg",
    image_public_url: "https://example.com/case2.jpg",
    summary: "适合科普内容",
    tags: ["信息图", "结构"],
    source_gallery_file: "gallery2.md",
    created_at: "2026-05-02T00:00:00Z",
    updated_at: "2026-05-02T00:00:00Z"
  },
  {
    id: "3",
    case_number: 3,
    title: "品牌海报",
    category_id: "cat-1",
    category_name: "UI与界面",
    prompt_text: "生成高对比度品牌海报",
    image_storage_path: "cases/case3.jpg",
    image_public_url: "https://example.com/case3.jpg",
    summary: "更偏向视觉宣传",
    tags: ["品牌", "高对比"],
    source_gallery_file: "gallery1.md",
    created_at: "2026-05-02T00:00:00Z",
    updated_at: "2026-05-02T00:00:00Z"
  }
];

describe("galleryFilters", () => {
  it("filters by case number, title, tags, category, summary, and prompt text", () => {
    expect(filterCases(cases, "3", allCategoriesLabel)).toHaveLength(1);
    expect(filterCases(cases, "知识结构", allCategoriesLabel)).toEqual([cases[1]]);
    expect(filterCases(cases, "海报", allCategoriesLabel)).toEqual([cases[0], cases[2]]);
    expect(filterCases(cases, "界面", "UI与界面")).toEqual([cases[0], cases[2]]);
  });

  it("filters by category name", () => {
    expect(filterCases(cases, "", "图表与信息可视化")).toEqual([cases[1]]);
  });

  it("sorts recommended cases to the top while preserving recommendation order", () => {
    expect(sortRecommendedCases(cases, [3, 1])).toEqual([cases[2], cases[0], cases[1]]);
  });
});
