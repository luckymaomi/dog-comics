import type { ProviderRegistry } from '../providers';
import type { AppConfig, Logger, SQLiteDatabase } from '../types/core';
import { AiConfigService } from './aiConfigService';
import { AssetArchiveService } from './assetArchiveService';
import { AssetRepository } from './assetRepository';
import { ImageGenerationService } from './imageGenerationService';
import { MediaReferenceService } from './mediaReferenceService';
import { MediaArchiveService } from './mediaArchiveService';
import { PanelArchiveService } from './panelArchiveService';
import { ProjectService } from './projectService';
import { TaskService } from './taskService';

export interface ServiceContainer {
  aiConfigs: AiConfigService;
  assets: AssetRepository;
  assetArchive: AssetArchiveService;
  panelArchive: PanelArchiveService;
  images: ImageGenerationService;
  projects: ProjectService;
  tasks: TaskService;
}

export function createServices(
  db: SQLiteDatabase,
  config: AppConfig,
  registry: ProviderRegistry,
  log: Logger,
): ServiceContainer {
  const aiConfigs = new AiConfigService(db, registry, config, log);
  const tasks = new TaskService(db, log);
  const mediaArchive = new MediaArchiveService(config, log);
  const projects = new ProjectService(db, mediaArchive, log);
  const assets = new AssetRepository(db, log);
  const mediaReferences = new MediaReferenceService(config, db);
  const images = new ImageGenerationService(db, mediaReferences, mediaArchive, aiConfigs, tasks, registry, log, assets);
  const assetArchive = new AssetArchiveService(db, assets, images, mediaArchive, config, log);
  const panelArchive = new PanelArchiveService(db, assets, images, mediaArchive, config, log);
  return {
    aiConfigs,
    assets,
    assetArchive,
    panelArchive,
    images,
    projects,
    tasks,
  };
}
