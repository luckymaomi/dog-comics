import type { AppConfig } from "../types/core";
import { ValidationError } from "../errors";
import { readString } from "../types/core";
import {
  FREEDUB_ENDPOINT,
  FreedubClient,
  type FreedubOptions,
  type FreedubSynthResult,
} from "./freedubClient";

/** 无落库的 PearAPI freedub 透传：仅列表与合成。 */
export class FreedubService {
  constructor(private readonly config: AppConfig) {}

  async options(): Promise<FreedubOptions> {
    return this.client().options();
  }

  async synthesize(input: {
    text: string;
    role?: string | null;
    style?: string | null;
  }): Promise<FreedubSynthResult> {
    return this.client().synthesize(input);
  }

  private client(): FreedubClient {
    const pear = this.config.ai?.providers?.pearapi;
    if (pear?.enabled === false) {
      throw new ValidationError("PearAPI 已在 config.yaml 中停用");
    }
    const apiKey = readString(pear?.api_key);
    if (!apiKey) throw new ValidationError("尚未配置 PearAPI API Key，无法配音");
    const base = (readString(pear?.base_url) || "https://api.pearapi.ai").replace(
      /\/+$/u,
      "",
    );
    const endpoint = base.endsWith("/api/freedub")
      ? base
      : `${base}/api/freedub`;
    return new FreedubClient(apiKey, endpoint || FREEDUB_ENDPOINT);
  }
}
