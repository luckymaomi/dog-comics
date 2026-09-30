import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../src/db/schema";
import { ProviderRegistry, modelCapabilities } from "../src/providers";
import { createServices } from "../src/services/container";
import type { AppConfig, Logger } from "../src/types/core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const log: Logger = { info() {}, warn() {}, error() {}, audit() {} };

test("video_prompt 可保存且不使图片配方过期", () => {
  const db = new Database(":memory:");
  initializeDatabase(db);
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dog-comics-video-prompt-"));
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
  try {
    const services = createServices(db, config, registry, log);
    const project = services.projects.create({ title: "视频提示词" });
    const episode = project.episodes?.[0];
    assert.ok(episode);
    const panel = services.assets.createPanel({
      episode_id: episode.id,
      title: "说法",
      image_recipe_prompt: "已有配方",
    });
    assert.equal(panel.video_prompt, "");
    assert.equal(panel.recipe_needs_reassembly, false);

    const updated = services.assets.updatePanel(panel.id, {
      video_prompt: "【运镜】慢推\n【镜头速度】慢板",
    });
    assert.match(updated.video_prompt, /慢推/);
    assert.equal(updated.recipe_needs_reassembly, false);
    assert.equal(updated.image_recipe_prompt, "已有配方");
  } finally {
    db.close();
    fs.rmSync(storageRoot, { recursive: true, force: true });
  }
});
