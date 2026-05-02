import { describe, expect, it } from "vitest";
import { parseGalleryMarkdown, parseIndexMarkdown } from "../parseGallery";

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
});
