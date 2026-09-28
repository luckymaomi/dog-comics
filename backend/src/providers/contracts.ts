import type { AiServiceConfig } from '../types/ai';
import type { Logger, SQLiteDatabase } from '../types/core';

export type ProviderKind = 'image' | 'video';
export type ProviderTaskStatus = 'queued' | 'running' | 'completed' | 'failed';
export type ProviderModelMode = 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video';
export type ProviderModelCapabilitySource = 'provider' | 'adapter' | 'adapter-override' | 'unknown';
/** 供应商的计费维度。它与是否接受 duration 是两个独立能力。 */
export type VideoBillingMode = 'duration' | 'per-request' | 'unknown';

export interface ProviderModelCapabilities {
  modes: ProviderModelMode[];
  maxReferenceImages: number | null;
  aspectRatios: string[] | null;
  billingMode: VideoBillingMode;
  supportsDuration: boolean;
  supportedDurations: number[] | null;
  source: ProviderModelCapabilitySource;
}

export interface ProviderCapabilities {
  textToImage: boolean;
  imageToImage: boolean;
  textToVideo: boolean;
  imageToVideo: boolean;
  asynchronous: boolean;
  multipleImageReferences: boolean;
  firstLastFrame: boolean;
}

export interface ProviderDescriptor {
  id: string;
  label: string;
  aliases: readonly string[];
  capabilities: ProviderCapabilities;
  configuration?: ProviderConfiguration;
}

export interface ProviderEndpointConfiguration {
  submit: string;
  query?: string;
}

export interface ProviderConfiguration {
  defaultBaseUrl?: string;
  endpoints?: Partial<Record<ProviderKind, ProviderEndpointConfiguration>>;
}

/** PearAPI 公开价目（/system/auth/models/all）合并到目录后的计费投影；缺价时为 undefined。 */
export interface ProviderModelPricing {
  /** 单次/单价，人民币数值；供应商未给时为 null */
  price: number | null;
  currency: 'CNY';
  /** 原始 billing_type，如 count / duration */
  billingType: string | null;
  /** 供应商中文摘要，如「按次 ¥0.14」 */
  summary: string | null;
}

export interface ProviderModel {
  id: string;
  label: string;
  kind: ProviderKind;
  capabilities: ProviderModelCapabilities;
  pricing?: ProviderModelPricing;
}

export interface ProviderModelDiscoveryInput {
  apiKey: string;
  baseUrl?: string;
  serviceType?: ProviderKind;
  signal?: AbortSignal;
}

export interface MediaReferenceResolveOptions {
  format?: 'inline' | 'public-url';
  label?: string;
}

export interface ProviderExecutionContext {
  config: AiServiceConfig;
  log: Logger;
  db?: SQLiteDatabase;
  resolveMediaReference?: (
    source: string,
    options?: MediaReferenceResolveOptions,
  ) => Promise<string | undefined>;
}

export interface ImageProviderRequest {
  prompt: string;
  model: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  negativePrompt?: string;
  referenceImages: string[];
  signal?: AbortSignal;
}

export interface VideoProviderRequest {
  prompt: string;
  model: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  seed?: number;
  image?: string;
  firstFrame?: string;
  lastFrame?: string;
  referenceImages: string[];
  signal?: AbortSignal;
}

export interface ImageProviderResult {
  status: ProviderTaskStatus;
  taskId?: string;
  imageUrl?: string;
  error?: string;
  progress?: number;
}

export interface VideoProviderResult {
  status: ProviderTaskStatus;
  taskId?: string;
  videoUrl?: string;
  error?: string;
  progress?: number;
}

export interface ProviderAdapter {
  descriptor: ProviderDescriptor;
  listModels?(input: ProviderModelDiscoveryInput): Promise<ProviderModel[]>;
  submitImage?(context: ProviderExecutionContext, request: ImageProviderRequest): Promise<ImageProviderResult>;
  pollImage?(context: ProviderExecutionContext, taskId: string, signal?: AbortSignal): Promise<ImageProviderResult>;
  submitVideo?(context: ProviderExecutionContext, request: VideoProviderRequest): Promise<VideoProviderResult>;
  pollVideo?(
    context: ProviderExecutionContext,
    taskId: string,
    signal?: AbortSignal,
    model?: string,
  ): Promise<VideoProviderResult>;
}

export const NO_PROVIDER_CAPABILITIES: ProviderCapabilities = Object.freeze({
  textToImage: false,
  imageToImage: false,
  textToVideo: false,
  imageToVideo: false,
  asynchronous: false,
  multipleImageReferences: false,
  firstLastFrame: false,
});
