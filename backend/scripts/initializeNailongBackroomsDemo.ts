import { loadConfig } from '../src/config';
import { closeDb, getDb } from '../src/db';
import { initializeDatabase } from '../src/db/schema';
import logger, { configureAuditLog } from '../src/logger';
import { providerRegistry } from '../src/providers';
import { createServices } from '../src/services/container';
import { initializeNailongBackroomsDemo } from './nailongBackroomsDemoRuntime';

async function main(): Promise<void> {
  const config = loadConfig();
  configureAuditLog(process.env.POTATO_AUDIT_LOG_PATH?.trim() || undefined);
  const db = getDb(config.database);
  try {
    initializeDatabase(db);
    const services = createServices(db, config, providerRegistry, logger);
    const project = initializeNailongBackroomsDemo(db, services, logger);
    const characters = services.assets
      .listProjectAssets(project.id)
      .filter((asset) => asset.kind === 'character')
      .map((asset) => `${asset.name}(${asset.output_type})`);
    console.log(
      `Demo 已初始化：项目 ID ${project.id}；角色 ${characters.join('、') || '(无)'}；无参考图、提示词留空待组装。`,
    );
  } finally {
    closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
