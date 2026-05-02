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

function normalizeLineEndings(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n");
}

function caseErrorPrefix(caseNumber: number, sourceGalleryFile: string): string {
  return `${sourceGalleryFile} case ${caseNumber}`;
}

export function parseIndexMarkdown(markdown: string): ParsedCategory[] {
  const categories: ParsedCategory[] = [];
  const linePattern = /gallery(\d+)\.md：(.+?)\]\(gallery\1\.md\)/;

  for (const line of normalizeLineEndings(markdown).split("\n")) {
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
  const normalizedMarkdown = normalizeLineEndings(markdown);
  const cases: ParsedPromptCase[] = [];
  const anchorPattern = /^\s*<a id="case-(\d+)"><\/a>\s*$/gm;
  const anchors = Array.from(normalizedMarkdown.matchAll(anchorPattern));

  for (let index = 0; index < anchors.length; index += 1) {
    const anchorMatch = anchors[index];
    const anchorNumber = Number(anchorMatch[1]);
    const sectionStart = anchorMatch.index ?? 0;
    const sectionEnd =
      index + 1 < anchors.length
        ? anchors[index + 1].index ?? normalizedMarkdown.length
        : normalizedMarkdown.length;
    const section = normalizedMarkdown.slice(sectionStart, sectionEnd);

    const headingMatch = section.match(/^\s*### 例 (\d+)：([^\n]+)\s*$/m);
    if (!headingMatch || headingMatch.index === undefined) {
      throw new Error(
        `${caseErrorPrefix(anchorNumber, sourceGalleryFile)} malformed: missing case heading`
      );
    }

    const headingNumber = Number(headingMatch[1]);
    const title = headingMatch[2].trim();
    if (headingNumber !== anchorNumber) {
      throw new Error(
        `${caseErrorPrefix(anchorNumber, sourceGalleryFile)} mismatch: anchor ${anchorNumber} does not match heading ${headingNumber}`
      );
    }

    const afterHeading = section.slice(headingMatch.index + headingMatch[0].length);
    const imageMatch = afterHeading.match(
      /!\[[^\]]*]\(\s*(assets\/case(\d+)\.jpg)\s*\)/
    );
    if (!imageMatch || imageMatch.index === undefined) {
      throw new Error(
        `${caseErrorPrefix(anchorNumber, sourceGalleryFile)} malformed: missing image`
      );
    }

    const imageCaseNumber = Number(imageMatch[2]);
    if (imageCaseNumber !== anchorNumber) {
      throw new Error(
        `${caseErrorPrefix(anchorNumber, sourceGalleryFile)} mismatch: anchor ${anchorNumber} does not match image assets/case${imageCaseNumber}.jpg`
      );
    }

    const afterImage = afterHeading.slice(imageMatch.index + imageMatch[0].length);
    const promptMatch = afterImage.match(
      /\*\*提示词：\*\*(?:\s*\n\s*)*```text\s*\n([\s\S]*?)\n\s*```/
    );
    if (!promptMatch) {
      throw new Error(
        `${caseErrorPrefix(anchorNumber, sourceGalleryFile)} malformed: missing prompt fence`
      );
    }

    const promptText = promptMatch[1].trim();
    cases.push({
      case_number: anchorNumber,
      title,
      category_name: categoryName,
      prompt_text: promptText,
      local_image_path: imageMatch[1],
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
