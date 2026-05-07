import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyJsonLikePrompt,
  findJsonLikePromptCasesInMarkdown,
  scanRepoForJsonLikePrompts
} from "../scanJsonLikePrompts";

describe("classifyJsonLikePrompt", () => {
  it("classifies the supported JSON-like prompt structures", () => {
    expect(classifyJsonLikePrompt("{\"prompt\":\"生成一张海报\"}")).toBe(
      "simple_object"
    );
    expect(
      classifyJsonLikePrompt(
        "{\"prompt\":{\"subject\":\"人物\",\"style\":\"胶片\"}}"
      )
    ).toBe("nested_object");
    expect(classifyJsonLikePrompt("[{\"prompt\":\"第一张\"}]")).toBe(
      "array_structure"
    );
    expect(classifyJsonLikePrompt("{prompt: \"中文海报\"，style: \"复古\"}")).toBe(
      "mixed_punctuation"
    );
    expect(
      classifyJsonLikePrompt(
        "{\"prompt\":\"把 {{主体}} 放在 <场景> 中，保留 [风格]\"}"
      )
    ).toBe("complex_placeholders");
    expect(
      classifyJsonLikePrompt(
        "{argument name=\"subject\" default=\"一位美丽的网红\"}正在直播。"
      )
    ).toBe("complex_placeholders");
  });
});

describe("findJsonLikePromptCasesInMarkdown", () => {
  it("extracts JSON-like text prompt fences from representative case sections", () => {
    const markdown = `
# UI与界面

<a id="case-12"></a>

### 例 12：结构化海报提示词

![例 12：结构化海报提示词](assets/case12.jpg)

**提示词：**

\`\`\`text
{
  "prompt": "生成一张中文海报",
  "style": "复古"
}
\`\`\`

<a id="case-13"></a>

### 例 13：普通提示词

![例 13：普通提示词](assets/case13.jpg)

**提示词：**

\`\`\`text
生成一张普通中文海报。
\`\`\`

<a id="case-14"></a>

### 例 14：数组结构提示词

![例 14：数组结构提示词](assets/case14.jpg)

**提示词：**

\`\`\`text
[
  {"prompt": "第一张"},
  {"prompt": "第二张"}
]
\`\`\`
`;

    expect(findJsonLikePromptCasesInMarkdown("gallery9.md", markdown)).toEqual([
      {
        case_number: 12,
        source_gallery_file: "gallery9.md",
        prompt_text:
          '{\n  "prompt": "生成一张中文海报",\n  "style": "复古"\n}',
        structure: "simple_object"
      },
      {
        case_number: 14,
        source_gallery_file: "gallery9.md",
        prompt_text: '[\n  {"prompt": "第一张"},\n  {"prompt": "第二张"}\n]',
        structure: "array_structure"
      }
    ]);
  });
});

describe("scanRepoForJsonLikePrompts", () => {
  it("scans data gallery files in stable filename order", () => {
    const repoRoot = join(
      tmpdir(),
      `scan-json-like-prompts-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`
    );
    const galleryRoot = join(repoRoot, "data", "gallery");
    mkdirSync(galleryRoot, { recursive: true });
    writeFileSync(
      join(galleryRoot, "gallery2.md"),
      `
<a id="case-2"></a>
### 例 2：第二个文件
**提示词：**
\`\`\`text
[{"prompt":"来自 gallery2"}]
\`\`\`
`,
      "utf8"
    );
    writeFileSync(
      join(galleryRoot, "gallery1.md"),
      `
<a id="case-1"></a>
### 例 1：第一个文件
**提示词：**
\`\`\`text
{"prompt":"来自 gallery1"}
\`\`\`
`,
      "utf8"
    );

    expect(
      scanRepoForJsonLikePrompts(repoRoot).map((promptCase) => [
        promptCase.source_gallery_file,
        promptCase.case_number
      ])
    ).toEqual([
      ["gallery1.md", 1],
      ["gallery2.md", 2]
    ]);
  });
});
