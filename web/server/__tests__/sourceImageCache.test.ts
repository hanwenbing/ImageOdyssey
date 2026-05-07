// @vitest-environment node

import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServiceRoleClientMock } = vi.hoisted(() => ({
  getServiceRoleClientMock: vi.fn()
}));

vi.mock("../supabase", () => ({
  getServiceRoleClient: getServiceRoleClientMock
}));

import { resolveSourceImageDataUrl, resolveSourceImagePath } from "../sourceImageCache";

const cacheRoot = resolve(process.cwd(), "tmp", "maas-source-images");

function createStorageClient(download: ReturnType<typeof vi.fn>) {
  return {
    storage: {
      from: vi.fn((bucketName: string) => {
        expect(bucketName).toBe("experiment-images");
        return { download };
      })
    }
  };
}

beforeEach(async () => {
  await rm(cacheRoot, { recursive: true, force: true });
  getServiceRoleClientMock.mockReset();
});

describe("source image cache", () => {
  it("converts private experiment images to MaaS data URLs", async () => {
    const download = vi.fn().mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      error: null
    });
    getServiceRoleClientMock.mockReturnValue(createStorageClient(download));

    const dataUrl = await resolveSourceImageDataUrl("source/source-image.png");

    expect(download).toHaveBeenCalledWith("source/source-image.png");
    expect(dataUrl).toBe("data:image/png;base64,AQID");
  });

  it("uses the storage path extension for data URLs when Blob type is missing", async () => {
    const download = vi.fn().mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3])]),
      error: null
    });
    getServiceRoleClientMock.mockReturnValue(createStorageClient(download));

    const dataUrl = await resolveSourceImageDataUrl("source/source-image.jpg");

    expect(dataUrl).toBe("data:image/jpeg;base64,AQID");
  });

  it("fails clearly when data URL download fails", async () => {
    const download = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("not found")
    });
    getServiceRoleClientMock.mockReturnValue(createStorageClient(download));

    await expect(resolveSourceImageDataUrl("source/missing.png")).rejects.toThrow(
      /Source image download failed: not found/
    );
  });

  it("downloads private experiment images to the local MaaS cache", async () => {
    const download = vi.fn().mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      error: null
    });
    getServiceRoleClientMock.mockReturnValue(createStorageClient(download));

    const cachedPath = await resolveSourceImagePath("source/source-image.png");

    expect(download).toHaveBeenCalledWith("source/source-image.png");
    expect(cachedPath).toMatch(/tmp[\\/]+maas-source-images[\\/]+[a-f0-9]{64}\.png$/);
    expect(existsSync(cachedPath)).toBe(true);
  });

  it("uses the web tmp cache even when the process cwd changes", async () => {
    const originalCwd = process.cwd();
    const download = vi.fn().mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      error: null
    });
    getServiceRoleClientMock.mockReturnValue(createStorageClient(download));

    try {
      process.chdir(resolve(process.cwd(), ".."));
      const cachedPath = await resolveSourceImagePath("source/other-image.png");

      expect(cachedPath).toMatch(/web[\\/]+tmp[\\/]+maas-source-images[\\/]+[a-f0-9]{64}\.png$/);
      expect(existsSync(cachedPath)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("reuses an existing cached image for the same storage path", async () => {
    const download = vi.fn().mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      error: null
    });
    getServiceRoleClientMock.mockReturnValue(createStorageClient(download));

    const firstPath = await resolveSourceImagePath("source/source-image.png");
    const secondPath = await resolveSourceImagePath("source/source-image.png");

    expect(secondPath).toBe(firstPath);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when Supabase download fails", async () => {
    const download = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("not found")
    });
    getServiceRoleClientMock.mockReturnValue(createStorageClient(download));

    await expect(resolveSourceImagePath("source/missing.png")).rejects.toThrow(
      /Source image download failed: not found/
    );
  });

  it("fails clearly when Supabase returns an empty file", async () => {
    const download = vi.fn().mockResolvedValue({
      data: new Blob([]),
      error: null
    });
    getServiceRoleClientMock.mockReturnValue(createStorageClient(download));

    await expect(resolveSourceImagePath("source/empty.png")).rejects.toThrow(
      /empty file/
    );
  });
});
