import { describe, expect, it } from "vitest";
import { applyPromptRewritesToMarkdown } from "../applyPromptRewrites";

const sampleMarkdown = [
  "# Gallery",
  "",
  "<a id=\"case-1\"></a>",
  "",
  "### Case 1: First case",
  "",
  "![Case 1](assets/case1.jpg)",
  "",
  "Intro copy.",
  "",
  "**Prompt:**",
  "",
  "```text",
  "old prompt 1",
  "```",
  "",
  "```text",
  "extra fence that should stay unchanged",
  "```",
  "",
  "<a id=\"case-2\"></a>",
  "",
  "### Case 2: Second case",
  "",
  "![Case 2](assets/case2.jpg)",
  "",
  "**Prompt:**",
  "",
  "```text",
  "old prompt 2",
  "```",
  "",
  "Ending copy.",
  ""
].join("\r\n");

describe("applyPromptRewritesToMarkdown", () => {
  it("only replaces the target case prompt fence", () => {
    const rewritten = applyPromptRewritesToMarkdown(sampleMarkdown, [
      { case_number: 1, rewritten_prompt_text: "new prompt 1" }
    ]);

    expect(rewritten).toContain("<a id=\"case-1\"></a>");
    expect(rewritten).toContain("### Case 1: First case");
    expect(rewritten).toContain("![Case 1](assets/case1.jpg)");
    expect(rewritten).toContain("Intro copy.");
    expect(rewritten).toContain("```text\r\nnew prompt 1\r\n```");
    expect(rewritten).toContain(
      "```text\r\nextra fence that should stay unchanged\r\n```"
    );
    expect(rewritten).toContain("```text\r\nold prompt 2\r\n```");
    expect(rewritten).not.toContain("old prompt 1");
    expect(rewritten).toContain("\r\n");
  });

  it("throws when the target case is missing", () => {
    expect(() =>
      applyPromptRewritesToMarkdown(sampleMarkdown, [
        { case_number: 9, rewritten_prompt_text: "new prompt 9" }
      ])
    ).toThrow("missing replacement target case 9");
  });

  it("rejects replacements that start with structured prompt markers", () => {
    expect(() =>
      applyPromptRewritesToMarkdown(sampleMarkdown, [
        { case_number: 1, rewritten_prompt_text: " {\"prompt\":\"structured\"}" }
      ])
    ).toThrow();

    expect(() =>
      applyPromptRewritesToMarkdown(sampleMarkdown, [
        { case_number: 1, rewritten_prompt_text: " [\"structured\"]" }
      ])
    ).toThrow();

    expect(() =>
      applyPromptRewritesToMarkdown(sampleMarkdown, [
        { case_number: 1, rewritten_prompt_text: " ```json\n{}\n```" }
      ])
    ).toThrow();
  });

  it("replaces only the requested case when one markdown has multiple cases", () => {
    const rewritten = applyPromptRewritesToMarkdown(sampleMarkdown, [
      { case_number: 2, rewritten_prompt_text: "new prompt 2" }
    ]);

    expect(rewritten).toContain("```text\r\nold prompt 1\r\n```");
    expect(rewritten).toContain("```text\r\nnew prompt 2\r\n```");
    expect(rewritten).not.toContain("old prompt 2");
  });
});
