import assert from "node:assert/strict";
import test from "node:test";
import {
  FOLDER_KIND,
  KIND_FOLDER,
  archiveZipFileName,
  parseArchiveImageEntry,
  sanitizeArchiveBaseName,
  uniqueArchiveFileName,
} from "../src/services/assetArchiveFormat";

test("三类文件夹与物品卡别名", () => {
  assert.equal(KIND_FOLDER.character, "角色卡");
  assert.equal(KIND_FOLDER.scene, "场景卡");
  assert.equal(KIND_FOLDER.prop, "道具卡");
  assert.equal(FOLDER_KIND["物品卡"], "prop");
});

test("解析 ZIP 条目路径", () => {
  assert.deepEqual(parseArchiveImageEntry("角色卡/奶龙.png"), {
    kind: "character",
    name: "奶龙",
    ext: ".png",
  });
  assert.deepEqual(parseArchiveImageEntry("物品卡/宝剑.webp"), {
    kind: "prop",
    name: "宝剑",
    ext: ".webp",
  });
  assert.equal(parseArchiveImageEntry("角色卡/子目录/a.png"), null);
  assert.equal(parseArchiveImageEntry("__MACOSX/角色卡/._奶龙.png"), null);
  assert.equal(parseArchiveImageEntry("杂项/a.png"), null);
});

test("安全文件名与重名编号", () => {
  assert.equal(sanitizeArchiveBaseName('a/b:c*d'), "a_b_c_d");
  const used = new Set<string>();
  assert.equal(uniqueArchiveFileName("奶龙", ".png", used), "奶龙.png");
  assert.equal(uniqueArchiveFileName("奶龙", ".png", used), "奶龙_2.png");
  assert.equal(archiveZipFileName("奶龙项目", 1), "奶龙项目-资产图存档.zip");
});
