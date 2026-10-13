import { ValidationError } from "../errors";
import { asRecord, readString } from "../types/core";

export const FREEDUB_ENDPOINT = "https://api.pearapi.ai/api/freedub";
export const FREEDUB_DEFAULT_ROLE = "zh-CN-XiaochenNeural";
export const FREEDUB_DEFAULT_STYLE = "assistant";

export type FreedubOption = { id: string; label: string };

export type FreedubOptions = {
  voices: FreedubOption[];
  styles: FreedubOption[];
};

export type FreedubSynthResult = {
  audio_url: string;
  role: string | null;
  style: string | null;
};

type FetchLike = typeof fetch;

/** 解析列表：兼容真实 voicelist/stylelist 对象，以及旧 roles/styles 数组。 */
export function parseFreedubOptions(body: unknown): FreedubOptions {
  const root = asRecord(body) ?? {};
  const data = asRecord(root.data) ?? root;
  return {
    voices: optionMap(data.voicelist ?? data.voiceList ?? data.roles),
    styles: optionMap(data.stylelist ?? data.styleList ?? data.styles),
  };
}

export function parseFreedubAudioUrl(body: unknown): string {
  const root = asRecord(body) ?? {};
  if (typeof root.code === "number" && root.code !== 200) {
    throw new ValidationError(
      readString(root.msg) || `freedub 失败：code ${root.code}`,
    );
  }
  const data = asRecord(root.data) ?? root;
  const url =
    readString(data.audio_url) ||
    readString(data.audioUrl) ||
    readString(data.url);
  if (!url) throw new ValidationError("freedub 未返回 audio_url");
  return url;
}

function optionMap(value: unknown): FreedubOption[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string" && item.trim()) {
          return { id: item.trim(), label: item.trim() };
        }
        const row = asRecord(item);
        const id = readString(row?.id) || readString(row?.value);
        if (!id) return null;
        return {
          id,
          label: readString(row?.label) || readString(row?.name) || id,
        };
      })
      .filter((item): item is FreedubOption => Boolean(item));
  }
  const record = asRecord(value);
  if (!record) return [];
  return Object.entries(record)
    .map(([id, raw]) => {
      const key = id.trim();
      if (!key) return null;
      return {
        id: key,
        label: readString(raw) || key,
      };
    })
    .filter((item): item is FreedubOption => Boolean(item));
}

export class FreedubClient {
  constructor(
    private readonly apiKey: string,
    private readonly endpoint = FREEDUB_ENDPOINT,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async options(): Promise<FreedubOptions> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "GET",
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new ValidationError(`freedub 目录失败：HTTP ${response.status}`);
    }
    const options = parseFreedubOptions(await response.json());
    if (options.voices.length === 0) {
      throw new ValidationError("freedub 未返回可用音色");
    }
    return options;
  }

  async synthesize(input: {
    text: string;
    role?: string | null;
    style?: string | null;
  }): Promise<FreedubSynthResult> {
    const text = input.text.trim();
    if (!text) throw new ValidationError("配音文案不能为空");
    const role = readString(input.role) || FREEDUB_DEFAULT_ROLE;
    const style = readString(input.style) || FREEDUB_DEFAULT_STYLE;
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, role, style }),
    });
    if (!response.ok) {
      throw new ValidationError(`freedub 合成失败：HTTP ${response.status}`);
    }
    const audio_url = parseFreedubAudioUrl(await response.json());
    return { audio_url, role, style };
  }

  private headers(): Record<string, string> {
    const key = this.apiKey.trim();
    return key ? { Authorization: `Bearer ${key}` } : {};
  }
}
