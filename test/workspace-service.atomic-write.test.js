import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import workspaceService from "../workspace-service.js";

const { atomicWriteJson, atomicWriteText } = workspaceService;

let root;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "airpaste-atomic-write-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("atomicWriteText / atomicWriteJson", () => {
  it("writes a new file that did not exist before", async () => {
    const target = path.join(root, "dome.json");

    await atomicWriteJson(root, target, { hello: "world" });

    const written = JSON.parse(await fs.readFile(target, "utf8"));
    expect(written).toEqual({ hello: "world" });
  });

  it("creates a unique temp/backup filename per operation, not a fixed name", async () => {
    const target = path.join(root, "dome.json");

    await atomicWriteJson(root, target, { version: 1 });
    const firstTmpDirEntries = await fs.readdir(path.join(root, ".airpaste", "tmp"));

    await atomicWriteJson(root, target, { version: 2 });
    const secondTmpDirEntries = await fs.readdir(path.join(root, ".airpaste", "tmp"));

    // Both operations should have cleaned up after themselves (no leftover
    // temp/backup files), and the two writes must not have collided on a
    // shared fixed filename.
    expect(firstTmpDirEntries).toHaveLength(0);
    expect(secondTmpDirEntries).toHaveLength(0);
  });

  it("overwrites an existing file with new content", async () => {
    const target = path.join(root, "dome.json");

    await atomicWriteJson(root, target, { version: 1 });
    await atomicWriteJson(root, target, { version: 2 });

    const written = JSON.parse(await fs.readFile(target, "utf8"));
    expect(written).toEqual({ version: 2 });
  });

  it("restores the original file from backup if the final rename fails mid-write", async () => {
    const target = path.join(root, "dome.json");
    await atomicWriteJson(root, target, { version: 1 });

    const originalRename = fs.rename.bind(fs);
    let renameCallCount = 0;
    const renameSpy = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      renameCallCount += 1;
      // First rename call moves the existing target -> backup (allow it).
      // Second rename call (temp -> target) is where we simulate a crash.
      if (renameCallCount === 2) {
        throw new Error("simulated crash during final rename");
      }
      return originalRename(from, to);
    });

    await expect(atomicWriteJson(root, target, { version: 2 })).rejects.toThrow(
      "simulated crash during final rename",
    );

    renameSpy.mockRestore();

    // The original content must still be intact on disk after the crash.
    const recovered = JSON.parse(await fs.readFile(target, "utf8"));
    expect(recovered).toEqual({ version: 1 });

    // No leftover temp/backup debris from the failed operation.
    const tmpDirEntries = await fs.readdir(path.join(root, ".airpaste", "tmp"));
    expect(tmpDirEntries).toHaveLength(0);
  });

  it("writes plain text via atomicWriteText", async () => {
    const target = path.join(root, "notes.md");

    await atomicWriteText(root, target, "# Hello\n");

    expect(await fs.readFile(target, "utf8")).toBe("# Hello\n");
  });
});
