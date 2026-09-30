import assert from "node:assert/strict";
import test from "node:test";
import {
  PANEL_FOLDER,
  panelArchiveBaseName,
  panelArchiveZipFileName,
  parsePanelArchiveBaseName,
  parsePanelArchiveImageEntry,
} from "../src/services/panelArchiveFormat";

test("分镜文件夹名", () => {
  assert.equal(PANEL_FOLDER, "分镜");
});

test("解析 ZIP 条目路径", () => {
  assert.deepEqual(parsePanelArchiveImageEntry("分镜/01-虚空法会.png"), {
    panelNumber: 1,
    title: "虚空法会",
    ext: ".png",
  });
  assert.deepEqual(parsePanelArchiveImageEntry("分镜/期盼魔.webp"), {
    panelNumber: null,
    title: "期盼魔",
    ext: ".webp",
  });
  assert.equal(parsePanelArchiveImageEntry("分镜/子目录/a.png"), null);
  assert.equal(parsePanelArchiveImageEntry("__MACOSX/分镜/._a.png"), null);
  assert.equal(parsePanelArchiveImageEntry("角色卡/a.png"), null);
});

test("文件名序号与 ZIP 名", () => {
  assert.equal(panelArchiveBaseName(3, "畏惧魔"), "03-畏惧魔");
  assert.deepEqual(parsePanelArchiveBaseName("02-期盼魔"), {
    panelNumber: 2,
    title: "期盼魔",
  });
  assert.equal(
    panelArchiveZipFileName("奶龙项目", 1, 2),
    "奶龙项目-第2话-分镜存档.zip",
  );
});
