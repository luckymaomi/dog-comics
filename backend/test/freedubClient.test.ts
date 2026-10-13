import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseFreedubAudioUrl,
  parseFreedubOptions,
} from "../src/services/freedubClient";

describe("freedubClient 解析", () => {
  it("解析真实 voicelist / stylelist 对象", () => {
    const options = parseFreedubOptions({
      code: 200,
      data: {
        voicelist: {
          "zh-CN-XiaoxiaoNeural": "晓晓 (女声·温柔)",
          "zh-CN-YunxiNeural": "云希 (男声·清朗)",
        },
        stylelist: {
          general: "通用风格",
          calm: "平静舒缓",
        },
      },
    });
    assert.deepEqual(options.voices, [
      { id: "zh-CN-XiaoxiaoNeural", label: "晓晓 (女声·温柔)" },
      { id: "zh-CN-YunxiNeural", label: "云希 (男声·清朗)" },
    ]);
    assert.deepEqual(options.styles, [
      { id: "general", label: "通用风格" },
      { id: "calm", label: "平静舒缓" },
    ]);
  });

  it("兼容旧 roles / styles 数组", () => {
    const options = parseFreedubOptions({
      data: {
        roles: ["zh-CN-XiaoyiNeural"],
        styles: ["cheerful"],
      },
    });
    assert.deepEqual(options.voices[0], {
      id: "zh-CN-XiaoyiNeural",
      label: "zh-CN-XiaoyiNeural",
    });
    assert.deepEqual(options.styles[0], {
      id: "cheerful",
      label: "cheerful",
    });
  });

  it("取出 audio_url", () => {
    assert.equal(
      parseFreedubAudioUrl({
        code: 200,
        data: { audio_url: "https://cdn.example/a.mp3" },
      }),
      "https://cdn.example/a.mp3",
    );
  });
});
