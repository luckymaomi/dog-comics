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
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "potato-panel-archive-"));
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

test("导出当前选用底板 ZIP，再导入成新分镜挂当前指针", async () => {
  const { db, services, storageRoot } = setup();
  try {
    const project = services.projects.create({ title: "分镜存档测试" });
    const episode = project.episodes?.[0];
    assert.ok(episode);

    const panel = services.assets.createPanel({
      episode_id: episode.id,
      title: "虚空法会",
    });
    const source = path.join(storageRoot, "seed.png");
    fs.writeFileSync(source, Buffer.from(TEST_PNG, "base64"));
    await services.images.importLocal({
      dramaId: project.id,
      panelId: panel.id,
      sourcePath: source,
      prompt: "seed",
    });

    const refreshed = services.assets.getPanel(panel.id);
    assert.ok(refreshed?.image_url?.startsWith("/static/"));
    assert.ok(refreshed?.current_image_generation_id);

    const exported = await services.panelArchive.exportZip(project.id, episode.id);
    assert.equal(exported.exported, 1);
    assert.match(exported.filename, /分镜存档测试-第1话-分镜存档\.zip$/u);

    const zip = await JSZip.loadAsync(exported.buffer);
    assert.ok(zip.folder("分镜"));
    assert.ok(zip.file("分镜/01-虚空法会.png"));

    const out = path.join(storageRoot, "roundtrip.zip");
    fs.writeFileSync(out, exported.buffer);

    const target = services.projects.create({ title: "导入目标" });
    const targetEpisode = target.episodes?.[0];
    assert.ok(targetEpisode);

    const imported = await services.panelArchive.importZip(target.id, targetEpisode.id, out);
    assert.equal(imported.imported, 1);
    assert.equal(imported.created[0]?.title, "虚空法会");
    assert.ok(imported.created[0]?.image_url?.startsWith("/static/"));
    assert.ok(imported.created[0]?.current_image_generation_id);

    const history = db
      .prepare("SELECT COUNT(*) AS n FROM image_generations WHERE panel_id = ?")
      .get(imported.created[0]!.id) as { n: number };
    assert.equal(history.n, 1);
  } finally {
    db.close();
  }
});

test("无本地底板时导出拒绝", async () => {
  const { db, services } = setup();
  try {
    const project = services.projects.create({ title: "空分镜" });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    services.assets.createPanel({ episode_id: episode.id, title: "空镜" });
    await assert.rejects(
      () => services.panelArchive.exportZip(project.id, episode.id),
      /没有可导出/,
    );
  } finally {
    db.close();
  }
});
