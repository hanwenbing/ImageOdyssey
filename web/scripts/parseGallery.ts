export type ParsedCategory = {
  slug: string;
  name: string;
  sort_order: number;
  source_gallery_file: string;
};

export type ParsedPromptCase = {
  case_number: number;
  title: string;
  category_name: string;
  prompt_text: string;
  local_image_path: string;
  source_gallery_file: string;
  summary: string;
  tags: string[];
  prompt_excerpt: string;
};

export function parseIndexMarkdown(markdown: string): ParsedCategory[] {
  const categories: ParsedCategory[] = [];
  const linePattern = /gallery(\d+)\.md：(.+?)\]\(gallery\1\.md\)/;

  for (const line of markdown.split("\n")) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const sortOrder = Number(match[1]);
    categories.push({
      slug: `gallery${sortOrder}`,
      name: match[2].trim(),
      sort_order: sortOrder,
      source_gallery_file: `gallery${sortOrder}.md`
    });
  }

  return categories;
}

export function parseGalleryMarkdown(
  sourceGalleryFile: string,
  categoryName: string,
  markdown: string
): ParsedPromptCase[] {
  const cases: ParsedPromptCase[] = [];
  const casePattern =
    /### 例 (\d+)：(.+?)\n\n!\[.*?\]\((assets\/case\d+\.jpg)\)\n\n\*\*提示词：\*\*\n\n```text\n([\s\S]*?)\n```/g;

  for (const match of markdown.matchAll(casePattern)) {
    const promptText = match[4].trim();
    const title = match[2].trim();

    cases.push({
      case_number: Number(match[1]),
      title,
      category_name: categoryName,
      prompt_text: promptText,
      local_image_path: match[3],
      source_gallery_file: sourceGalleryFile,
      summary: title,
      tags: Array.from(new Set([categoryName, title])),
      prompt_excerpt: createPromptExcerpt(promptText)
    });
  }

  return cases;
}

export function createPromptExcerpt(promptText: string): string {
  const normalized = promptText.replace(/\s+/g, " ").trim();
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 180)}...`;
}
