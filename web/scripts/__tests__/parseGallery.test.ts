import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPromptExcerpt,
  parseGalleryMarkdown,
  parseIndexMarkdown
} from "../parseGallery";

const repoRoot = resolve(process.cwd(), "..");
const galleryRoot = resolve(repoRoot, "data", "gallery");

describe("parseIndexMarkdown", () => {
  it("extracts category metadata from index links", () => {
    const markdown = `
## 分册入口

- [gallery1.md：UI与界面](gallery1.md) - 86 个案例，例 2-354
- [gallery13.md：其他应用场景](gallery13.md) - 25 个案例，例 178-334

## 使用工作流

- [gallery2.md：图表与信息可视化](gallery2.md) - duplicate-looking prose outside section
`;

    expect(parseIndexMarkdown(markdown)).toEqual([
      {
        slug: "gallery1",
        name: "UI与界面",
        sort_order: 1,
        source_gallery_file: "gallery1.md"
      },
      {
        slug: "gallery13",
        name: "其他应用场景",
        sort_order: 13,
        source_gallery_file: "gallery13.md"
      }
    ]);
  });

  it("throws for malformed gallery index lines", () => {
    const markdown = `
## 分册入口

- [gallery1.md UI与界面](gallery1.md) - 86 个案例，例 2-354
`;

    expect(() => parseIndexMarkdown(markdown)).toThrow(
      /malformed gallery index line.*gallery1\.md UI与界面/i
    );
  });

  it("ignores ordinary prose that mentions gallery files", () => {
    const markdown = `
## 分册入口

See gallery1.md for details.
The parser should still ignore unrelated prose.
`;

    expect(parseIndexMarkdown(markdown)).toEqual([]);
  });

  it("ignores link-like gallery entries outside the booklet entry section", () => {
    const markdown = `
## 其他说明

[gallery1.md：UI与界面](gallery1.md)

## 分册入口

- [gallery2.md：图表与信息可视化](gallery2.md) - 59 个案例，例 1-348

## 使用工作流

- [gallery3.md：海报与排版](gallery3.md) - duplicate-looking prose outside section
`;

    expect(parseIndexMarkdown(markdown)).toEqual([
      {
        slug: "gallery2",
        name: "图表与信息可视化",
        sort_order: 2,
        source_gallery_file: "gallery2.md"
      }
    ]);
  });
});

describe("parseGalleryMarkdown", () => {
  it("extracts case number, title, image, and prompt", () => {
    const markdown = `
# UI与界面

<a id="case-2"></a>

### 例 2：社媒界面截图

![例 2：社媒界面截图](assets/case2.jpg)

**提示词：**

\`\`\`text
画一张 X 的内容截图。
\`\`\`

***
`;

    expect(parseGalleryMarkdown("gallery1.md", "UI与界面", markdown)).toEqual([
      {
        case_number: 2,
        title: "社媒界面截图",
        category_name: "UI与界面",
        prompt_text: "画一张 X 的内容截图。",
        local_image_path: "assets/case2.jpg",
        source_gallery_file: "gallery1.md",
        summary: "社媒界面截图",
        tags: ["UI与界面", "社媒界面截图"],
        prompt_excerpt: "画一张 X 的内容截图。"
      }
    ]);
  });

  it("parses multiline prompts with CRLF and extra blank lines", () => {
    const markdown = [
      "# UI与界面",
      "",
      "<a id=\"case-2\"></a>",
      "",
      "",
      "### 例 2：社媒界面截图",
      "",
      "",
      "![例 2：社媒界面截图](assets/case2.jpg)",
      "",
      "",
      "**提示词：**",
      "",
      "",
      "```text",
      "第一行",
      "",
      "第二行",
      "```",
      "",
      "***",
      ""
    ].join("\r\n");

    expect(parseGalleryMarkdown("gallery1.md", "UI与界面", markdown)).toEqual([
      {
        case_number: 2,
        title: "社媒界面截图",
        category_name: "UI与界面",
        prompt_text: "第一行\n\n第二行",
        local_image_path: "assets/case2.jpg",
        source_gallery_file: "gallery1.md",
        summary: "社媒界面截图",
        tags: ["UI与界面", "社媒界面截图"],
        prompt_excerpt: "第一行 第二行"
      }
    ]);
  });

  it("throws when the case section numbers do not match", () => {
    const markdown = `
# UI与界面

<a id="case-7"></a>

### 例 8：标题不一致

![例 8：标题不一致](assets/case8.jpg)

**提示词：**

\`\`\`text
画一张 X 的内容截图。
\`\`\`
`;

    expect(() =>
      parseGalleryMarkdown("gallery1.md", "UI与界面", markdown)
    ).toThrow(/gallery1\.md.*case 7.*mismatch/i);
  });

  it("throws when a prompt fence is missing", () => {
    const markdown = `
# UI与界面

<a id="case-9"></a>

### 例 9：缺少提示词

![例 9：缺少提示词](assets/case9.jpg)
`;

    expect(() =>
      parseGalleryMarkdown("gallery1.md", "UI与界面", markdown)
    ).toThrow(/gallery1\.md.*case 9.*prompt/i);
  });

  it("throws when a valid-looking case is missing its anchor", () => {
    const markdown = `
# UI与界面

### 例 2：社媒界面截图

![例 2：社媒界面截图](assets/case2.jpg)

**提示词：**

\`\`\`text
画一张 X 的内容截图。
\`\`\`
`;

    expect(() =>
      parseGalleryMarkdown("gallery1.md", "UI与界面", markdown)
    ).toThrow(/gallery1\.md.*case 2.*anchor/i);
  });

  it("throws when duplicate case anchors appear in one gallery file", () => {
    const markdown = `
# UI与界面

<a id="case-2"></a>

### 例 2：社媒界面截图

![例 2：社媒界面截图](assets/case2.jpg)

**提示词：**

\`\`\`text
画一张 X 的内容截图。
\`\`\`

<a id="case-2"></a>

### 例 2：重复编号案例

![例 2：重复编号案例](assets/case2.jpg)

**提示词：**

\`\`\`text
画一张 Y 的内容截图。
\`\`\`
`;

    expect(() =>
      parseGalleryMarkdown("gallery1.md", "UI与界面", markdown)
    ).toThrow(/gallery1\.md.*duplicate case anchor.*2/i);
  });

  it("throws when a second case heading appears inside one anchored section", () => {
    const markdown = `
# UI与界面

<a id="case-2"></a>

### 例 2：社媒界面截图

![例 2：社媒界面截图](assets/case2.jpg)

**提示词：**

\`\`\`text
画一张 X 的内容截图。
\`\`\`

### 例 3：缺少锚点的下一例

![例 3：缺少锚点的下一例](assets/case3.jpg)

**提示词：**

\`\`\`text
画一张 Y 的内容截图。
\`\`\`
`;

    expect(() =>
      parseGalleryMarkdown("gallery1.md", "UI与界面", markdown)
    ).toThrow(/gallery1\.md.*case 2.*extra case heading/i);
  });

  it("throws when duplicate image references appear inside one anchored section", () => {
    const markdown = `
# UI与界面

<a id="case-2"></a>

### 例 2：社媒界面截图

![例 2：社媒界面截图](assets/case2.jpg)

![例 3：缺少锚点的下一例](assets/case3.jpg)

**提示词：**

\`\`\`text
画一张 X 的内容截图。
\`\`\`
`;

    expect(() =>
      parseGalleryMarkdown("gallery1.md", "UI与界面", markdown)
    ).toThrow(/gallery1\.md.*case 2.*multiple image/i);
  });

  it("throws when duplicate prompt fences appear inside one anchored section", () => {
    const markdown = `
# UI与界面

<a id="case-2"></a>

### 例 2：社媒界面截图

![例 2：社媒界面截图](assets/case2.jpg)

**提示词：**

\`\`\`text
画一张 X 的内容截图。
\`\`\`

**提示词：**

\`\`\`text
画一张 Y 的内容截图。
\`\`\`
`;

    expect(() =>
      parseGalleryMarkdown("gallery1.md", "UI与界面", markdown)
    ).toThrow(/gallery1\.md.*case 2.*multiple prompt/i);
  });
});

describe("createPromptExcerpt", () => {
  it("normalizes whitespace and truncates long prompts", () => {
    const promptText = `
      第一段

      第二段    带有   多余空格
    `
      .repeat(20);
    const normalized = promptText.replace(/\s+/g, " ").trim();

    expect(createPromptExcerpt(promptText)).toBe(
      `${normalized.slice(0, 180)}...`
    );
  });
});

describe("real gallery corpus", () => {
  it("parses the data gallery index into 13 categories", () => {
    const indexMarkdown = readFileSync(resolve(galleryRoot, "index.md"), "utf8");

    expect(parseIndexMarkdown(indexMarkdown)).toHaveLength(13);
  });

  it("parses all data gallery files into 352 prompt cases", () => {
    const indexMarkdown = readFileSync(resolve(galleryRoot, "index.md"), "utf8");
    const categoriesByFile = new Map(
      parseIndexMarkdown(indexMarkdown).map((category) => [
        category.source_gallery_file,
        category.name
      ])
    );
    const totalCases = readdirSync(galleryRoot)
      .filter((fileName) => /^gallery\d+\.md$/.test(fileName))
      .sort(
        (left, right) =>
          Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0])
      )
      .reduce((total, fileName) => {
        const categoryName = categoriesByFile.get(fileName);
        if (categoryName === undefined) {
          throw new Error(`Missing index category for ${fileName}`);
        }

        const galleryMarkdown = readFileSync(resolve(galleryRoot, fileName), "utf8");
        return (
          total +
          parseGalleryMarkdown(fileName, categoryName, galleryMarkdown).length
        );
      }, 0);

    expect(totalCases).toBe(352);
  });
});
