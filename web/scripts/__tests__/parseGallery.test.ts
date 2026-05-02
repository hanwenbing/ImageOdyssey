import { describe, expect, it } from "vitest";
import {
  createPromptExcerpt,
  parseGalleryMarkdown,
  parseIndexMarkdown
} from "../parseGallery";

describe("parseIndexMarkdown", () => {
  it("extracts category metadata from index links", () => {
    const markdown = `
- [gallery1.md：UI与界面](gallery1.md) - 86 个案例，例 2-354
- [gallery13.md：其他应用场景](gallery13.md) - 25 个案例，例 178-334
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
Some unrelated prose can stay here.
- [gallery1.md UI与界面](gallery1.md) - 86 个案例，例 2-354
`;

    expect(() => parseIndexMarkdown(markdown)).toThrow(
      /malformed gallery index line.*gallery1\.md UI与界面/i
    );
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
