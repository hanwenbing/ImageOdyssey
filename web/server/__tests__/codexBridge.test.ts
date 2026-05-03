import { EventEmitter } from "node:events";
import { dirname, resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadLocalCaseIndex } from "../localCorpus";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  __esModule: true,
  default: {
    spawn: spawnMock
  },
  spawn: spawnMock
}));

import { recommend, rewrite } from "../codexBridge";

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
};

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write: vi.fn(),
    end: vi.fn()
  };
  return child;
}

const repoRoot = resolve(process.cwd(), "..");
const expectedCodexCommand = process.platform === "win32" ? process.execPath : "npm";
const expectedCodexArgsPrefix =
  process.platform === "win32"
    ? [resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")]
    : [];

beforeEach(() => {
  spawnMock.mockReset();
});

describe("codexBridge.recommend", () => {
  it("parses noisy stdout, filters invalid cases, and limits output to three results", async () => {
    const tamperedCases = loadLocalCaseIndex().slice(0, 4).map((caseItem, index) => ({
      ...caseItem,
      title: `tampered title ${index + 1}`,
      category_name: `tampered category ${index + 1}`,
      summary: `tampered summary ${index + 1}`,
      tags: [`tampered-${index + 1}`],
      prompt_excerpt: `tampered excerpt ${index + 1}`
    }));
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = recommend({
      source_image_storage_path: "cases/source.jpg",
      user_query: "Recommend the closest three cases",
      category_filter: null,
      cases: tamperedCases
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      expectedCodexCommand,
      [
        ...expectedCodexArgsPrefix,
        "-C",
        "web",
        "exec",
        "codex",
        "--",
        "exec",
        "--ephemeral",
        "--sandbox",
        "read-only",
        "-C",
        repoRoot
      ],
      expect.objectContaining({
        cwd: repoRoot,
        windowsHide: true
      })
    );
    expect(child.stdin.write).toHaveBeenCalledTimes(1);
    expect(child.stdin.end).toHaveBeenCalledTimes(1);

    const prompt = child.stdin.write.mock.calls[0][0] as string;
    const localCase1 = loadLocalCaseIndex()[0];
    expect(prompt).toContain(localCase1.title);
    expect(prompt).toContain(localCase1.category_name);
    expect(prompt).toContain(localCase1.summary);
    for (const tag of localCase1.tags) {
      expect(prompt).toContain(tag);
    }
    expect(prompt).not.toContain("tampered title 1");
    expect(prompt).not.toContain("tampered category 1");
    expect(prompt).not.toContain("tampered summary 1");
    expect(prompt).not.toContain("tampered-1");

    child.stdout.emit(
      "data",
      Buffer.from(
        [
          "codex log: starting",
          '{"recommendations":[{"case_number":1,"reason":"first match"},{"case_number":2,"reason":"second match"},{"case_number":3,"reason":"third match"},{"case_number":4,"reason":"extra"}]}',
          "codex log: done"
        ].join("\n")
      )
    );
    child.emit("close", 0, null);

    await expect(promise).resolves.toEqual({
      recommendations: [
        { case_number: 1, reason: "first match" },
        { case_number: 2, reason: "second match" },
        { case_number: 3, reason: "third match" }
      ]
    });
  });

  it("throws for an invalid case number in Codex output", async () => {
    const cases = loadLocalCaseIndex().slice(0, 2);
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = recommend({
      source_image_storage_path: "cases/source.jpg",
      user_query: "Recommend",
      category_filter: null,
      cases
    });

    child.stdout.emit(
      "data",
      Buffer.from('{"recommendations":[{"case_number":999,"reason":"bad"}]}')
    );
    child.emit("close", 0, null);

    await expect(promise).rejects.toThrow(/invalid case_number 999/i);
  });

  it("throws for malformed JSON", async () => {
    const cases = loadLocalCaseIndex().slice(0, 1);
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = recommend({
      source_image_storage_path: "cases/source.jpg",
      user_query: "Recommend",
      category_filter: null,
      cases
    });

    child.stdout.emit("data", Buffer.from("noise only, no json"));
    child.emit("close", 0, null);

    await expect(promise).rejects.toThrow(/did not return a valid JSON object/i);
  });
});

describe("codexBridge.rewrite", () => {
  it("parses and validates rewrite output", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);

    const promise = rewrite({
      source_image_storage_path: "cases/source.jpg",
      case_number: loadLocalCaseIndex()[0].case_number,
      original_prompt_text: "Original prompt text"
    });

    expect(spawnMock).toHaveBeenCalledWith(
      expectedCodexCommand,
      [
        ...expectedCodexArgsPrefix,
        "-C",
        "web",
        "exec",
        "codex",
        "--",
        "exec",
        "--ephemeral",
        "--sandbox",
        "read-only",
        "-C",
        repoRoot
      ],
      expect.objectContaining({
        cwd: repoRoot,
        windowsHide: true
      })
    );
    expect(child.stdin.write).toHaveBeenCalledTimes(1);
    expect(child.stdin.end).toHaveBeenCalledTimes(1);

    child.stdout.emit(
      "data",
      Buffer.from(
        '{"rewritten_prompt_text":"Rewritten prompt text","preserved_parts":["subject","lighting"],"changed_parts":["composition"]}'
      )
    );
    child.emit("close", 0, null);

    await expect(promise).resolves.toEqual({
      rewritten_prompt_text: "Rewritten prompt text",
      preserved_parts: ["subject", "lighting"],
      changed_parts: ["composition"]
    });
  });
});
