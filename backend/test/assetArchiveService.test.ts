import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import Database from "better-sqlite3";
import JSZip from "jszip";
import { initializeDatabase } from "../src/db/schema";
import { ProviderRegistry, modelCapabilities } from "../src/providers";
import { createServices } from "../src/services/container";
import type { AppConfig, Logger } from "../src/types/core";

const log: Logger = { info() {}, warn() {}, error() {}, audit() {} };
const roots: string[] = [];
const TEST_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

after(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

function setup() {
  const db = new Database(":memory:");
  initializeDatabase(db);
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dog-comics-asset-archive-"));
  roots.push(storageRoot);
  const config: AppConfig = {
    app: { name: "test", version: "1" },
    server: {},
    database: { path: ":memory:" },
    storage: { local_path: storageRoot, base_url: "http://localhost:5679/static" },
    ai: { providers: {} },
  };
  const registry = new ProviderRegistry();
  registry.register({
    descriptor: {
      id: "local",
      label: "local",
      aliases: [],
      capabilities: {
        textToImage: false,
        imageToImage: false,
        textToVideo: false,
        imageToVideo: false,
        asynchronous: false,
        multipleImageReferences: false,
        firstLastFrame: false,
      },
    },
    listModels: async () => [
      {
        id: "noop",
        label: "noop",
        kind: "image",
        capabilities: modelCapabilities(["text-to-image"], 1, ["1:1"], "adapter"),
      },
    ],
  });
  return {
    db,
    services: createServices(db, config, registry, log),
    storageRoot,
  };
}

test("导出 ZIP 含三类文件夹与卡名图片，再导入成新卡", async () => {
  const { db, services, storageRoot } = setup();
  try {
    const project = services.projects.create({ title: "存档测试" });
    const character = services.assets.createProjectAsset(project.id, {
      kind: "character",
      name: "角色卡-奶龙-06",
    });
    const source = path.join(storageRoot, "seed.png");
    fs.writeFileSync(source, Buffer.from(TEST_PNG, "base64"));
    await services.images.importLocal({
      dramaId: project.id,
      projectAssetId: character.id,
      sourcePath: source,
      prompt: "seed",
    });

    const exported = await services.assetArchive.exportZip(project.id);
    assert.equal(exported.exported, 1);
    assert.match(exported.filename, /存档测试-资产图存档\.zip$/u);

    const zip = await JSZip.loadAsync(exported.buffer);
    assert.ok(zip.folder("角色卡"));
    assert.ok(zip.folder("场景卡"));
    assert.ok(zip.folder("道具卡"));
    assert.ok(zip.file("角色卡/角色卡-奶龙-06.png"));

    const out = path.join(storageRoot, "roundtrip.zip");
    fs.writeFileSync(out, exported.buffer);

    const target = services.projects.create({ title: "导入目标" });
    const imported = await services.assetArchive.importZip(target.id, out);
    assert.equal(imported.imported, 1);
    assert.equal(imported.created[0]?.kind, "character");
    assert.equal(imported.created[0]?.name, "角色卡-奶龙-06");
    assert.ok(imported.created[0]?.image_url?.startsWith("/static/"));
  } finally {
    db.close();
  }
});
