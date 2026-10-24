/**
 * Storage path/URL seam tests — no DB required: every assertion either
 * resolves before the lazy `@/db/client` import or writes to a tmp dir.
 *
 * - UPLOADS_DIR outside public/ must return /api/files/ URLs (the only
 *   read path that works for a mounted disk); the default dir keeps the
 *   static /uploads/ contract.
 * - db adapters must reject traversal and wrong-prefix URLs before ever
 *   touching the database.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { saveMediaLocally } from "./media/downloader";
import {
  assertSafePath,
  dbPrivateStorageAdapter,
  dbStorageAdapter,
  localStorageAdapter,
  PRIVATE_MEDIA_URL_PREFIX,
  privateUploadsDir,
  PUBLIC_FILES_URL_PREFIX,
  publicUploadsDir,
} from "./storage";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

const savedEnv = new Map<string, string | undefined>();
function setEnv(key: string, value: string | undefined) {
  if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  savedEnv.clear();
});

describe("dir env overrides", () => {
  it("publicUploadsDir defaults to <cwd>/public/uploads", () => {
    setEnv("UPLOADS_DIR", undefined);
    assert.equal(publicUploadsDir(), path.resolve(process.cwd(), "public", "uploads"));
  });

  it("publicUploadsDir honors UPLOADS_DIR", () => {
    const custom = path.join(tmpdir(), "ah-uploads-test");
    setEnv("UPLOADS_DIR", custom);
    assert.equal(publicUploadsDir(), path.resolve(custom));
  });

  it("privateUploadsDir honors MEDIA_UPLOADS_DIR", () => {
    setEnv("MEDIA_UPLOADS_DIR", undefined);
    assert.equal(privateUploadsDir(), path.join(process.cwd(), "private", "uploads"));
    const custom = path.join(tmpdir(), "ah-media-test");
    setEnv("MEDIA_UPLOADS_DIR", custom);
    assert.equal(privateUploadsDir(), path.resolve(custom));
  });
});

describe("assertSafePath", () => {
  it("rejects traversal, absolute paths and backslashes", () => {
    for (const bad of ["", "..", "a/../b", "/abs", "a\\b", "C:\\x"]) {
      assert.throws(() => assertSafePath(bad), /inválida/);
    }
  });
});

describe("localStorageAdapter url prefixes", () => {
  it("returns /api/files/ URLs when UPLOADS_DIR is outside public/", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "ah-uploads-"));
    setEnv("UPLOADS_DIR", dir);
    try {
      const { url, size } = await localStorageAdapter.upload(PNG_BYTES, "pending/t-1.png", "image/png");
      assert.equal(url, `${PUBLIC_FILES_URL_PREFIX}pending/t-1.png`);
      assert.equal(size, PNG_BYTES.length);
      const onDisk = await fs.readFile(path.join(dir, "pending", "t-1.png"));
      assert.deepEqual(onDisk, PNG_BYTES);
      await localStorageAdapter.delete(url);
      await assert.rejects(fs.stat(path.join(dir, "pending", "t-1.png")));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps /uploads/ URLs under the default public dir", async () => {
    setEnv("UPLOADS_DIR", "public/uploads");
    const relPath = "pending/test-storage-unit.png";
    const dest = path.resolve(publicUploadsDir(), relPath);
    try {
      const { url } = await localStorageAdapter.upload(PNG_BYTES, relPath, "image/png");
      assert.equal(url, `/uploads/${relPath}`);
      await localStorageAdapter.delete(url);
      await assert.rejects(fs.stat(dest));
    } finally {
      await fs.rm(dest, { force: true });
      await fs.rmdir(path.dirname(dest)).catch(() => {});
    }
  });

  it("rejects traversal relPaths", async () => {
    await assert.rejects(
      localStorageAdapter.upload(PNG_BYTES, "../escape.png", "image/png"),
      /inválida/
    );
  });
});

describe("db adapters never touch the db on guard failures", () => {
  it("delete ignores urls outside its own prefix", async () => {
    await dbStorageAdapter.delete("/uploads/a.png");
    await dbStorageAdapter.delete(`${PRIVATE_MEDIA_URL_PREFIX}a.png`);
    await dbPrivateStorageAdapter.delete("/uploads/a.png");
    await dbPrivateStorageAdapter.delete(`${PUBLIC_FILES_URL_PREFIX}a.png`);
  });

  it("delete rejects traversal before hitting the db", async () => {
    await assert.rejects(
      dbStorageAdapter.delete(`${PUBLIC_FILES_URL_PREFIX}../x.png`),
      /inválida/
    );
    await assert.rejects(
      dbPrivateStorageAdapter.delete(`${PRIVATE_MEDIA_URL_PREFIX}../x.png`),
      /inválida/
    );
  });

  it("upload validates path, mime and size before hitting the db", async () => {
    await assert.rejects(
      dbStorageAdapter.upload(PNG_BYTES, "../x.png", "image/png"),
      /inválida/
    );
    await assert.rejects(
      dbStorageAdapter.upload(PNG_BYTES, "ok/x.png", "application/x-evil"),
      /no permitido/
    );
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    await assert.rejects(
      dbStorageAdapter.upload(oversized, "ok/x.png", "image/png"),
      /supera los 5MB/
    );
  });

  it("media upload rejects unknown mimes and spoofed bytes", async () => {
    await assert.rejects(
      dbPrivateStorageAdapter.upload(PNG_BYTES, "m/x.png", "application/octet-stream"),
      /no permitido/
    );
    await assert.rejects(
      dbPrivateStorageAdapter.upload(Buffer.from("<html>xss</html>"), "m/x.png", "image/png"),
      /no permitido|no reconocido|no coincide/
    );
  });
});

describe("saveMediaLocally through activePrivateStorage", () => {
  it("writes inbound media under MEDIA_UPLOADS_DIR and returns the gated url", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "ah-media-"));
    setEnv("MEDIA_UPLOADS_DIR", dir);
    try {
      const url = await saveMediaLocally(PNG_BYTES, "conv-1", "foto.png", "image/png");
      assert.ok(url.startsWith(PRIVATE_MEDIA_URL_PREFIX));
      const rel = url.slice(PRIVATE_MEDIA_URL_PREFIX.length);
      const [scope, name] = rel.split("/");
      assert.equal(scope, "conv-1");
      assert.ok(name?.endsWith("foto.png"));
      const onDisk = await fs.readFile(path.join(dir, "conv-1", name!));
      assert.deepEqual(onDisk, PNG_BYTES);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
