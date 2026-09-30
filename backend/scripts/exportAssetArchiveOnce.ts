/**
 * 对真实库项目跑一次资产图 ZIP 导出，打印结构供人工验看。
 * 用法：cd backend && npx tsx scripts/exportAssetArchiveOnce.ts [projectId]
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import JSZip from "jszip";
import { loadConfig } from "../src/config";
import logger from "../src/logger";
import { ProviderRegistry } from "../src/providers";
import { createServices } from "../src/services/container";

async function main() {
  const config = loadConfig();
  const db = new Database(config.database.path);
  const services = createServices(db, config, new ProviderRegistry(), logger);
  const projectId = Number(process.argv[2] || 1);
  const result = await services.assetArchive.exportZip(projectId);
  const outDir = path.resolve("data", "exports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, result.filename);
  fs.writeFileSync(outPath, result.buffer);

  const zip = await JSZip.loadAsync(result.buffer);
  const entries = Object.keys(zip.files).sort((a, b) => a.localeCompare(b, "zh"));
  console.log(
    JSON.stringify(
      {
        outPath,
        filename: result.filename,
        exported: result.exported,
        skipped: result.skipped,
        bytes: result.buffer.length,
        entries,
      },
      null,
      2,
    ),
  );
  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
