import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { NotFoundError, ValidationError } from "../errors";
import type { AppConfig, Logger, SQLiteDatabase } from "../types/core";
import type { AssetKind, ProjectAssetRow } from "../types/domain";
import {
  KIND_FOLDER,
  archiveZipFileName,
  extensionFromPathOrMime,
  parseArchiveImageEntry,
  sanitizeArchiveBaseName,
  uniqueArchiveFileName,
} from "./assetArchiveFormat";
import type { AssetRepository } from "./assetRepository";
import type { ImageGenerationService } from "./imageGenerationService";
import type { MediaArchiveService } from "./mediaArchiveService";

export interface AssetArchiveExportResult {
  buffer: Buffer;
  filename: string;
  exported: number;
  skipped: number;
}

export interface AssetArchiveImportResult {
  created: ProjectAssetRow[];
  imported: number;
  skipped: number;
}

export class AssetArchiveService {
  private readonly storageRoot: string;

  constructor(
    private readonly db: SQLiteDatabase,
    private readonly assets: AssetRepository,
    private readonly images: ImageGenerationService,
    private readonly mediaArchive: MediaArchiveService,
    config: AppConfig,
    private readonly log?: Logger,
  ) {
    this.storageRoot = path.resolve(config.storage?.local_path ?? "./data/storage");
  }

  async exportZip(projectId: number): Promise<AssetArchiveExportResult> {
    const project = this.db
      .prepare("SELECT id, title FROM dramas WHERE id = ?")
      .get(projectId) as { id: number; title: string } | undefined;
    if (!project) throw new NotFoundError("项目不存在");

    const zip = new JSZip();
    for (const folder of Object.values(KIND_FOLDER)) {
      zip.folder(folder);
    }

    const usedNames: Record<AssetKind, Set<string>> = {
      character: new Set(),
      scene: new Set(),
      prop: new Set(),
    };

    let exported = 0;
    let skipped = 0;
    const list = this.assets.listProjectAssets(projectId);

    for (const asset of list) {
      const absolute = this.resolveLocalImagePath(asset);
      if (!absolute) {
        skipped += 1;
        continue;
      }
      const bytes = await fs.promises.readFile(absolute);
      const ext = extensionFromPathOrMime(absolute);
      const base = sanitizeArchiveBaseName(asset.name, `${asset.kind}-${asset.id}`);
      const fileName = uniqueArchiveFileName(base, ext, usedNames[asset.kind]);
      zip.file(`${KIND_FOLDER[asset.kind]}/${fileName}`, bytes);
      exported += 1;
    }

    if (exported === 0) {
      throw new ValidationError("当前项目没有可导出的本地标准资产图");
    }

    const buffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    const filename = archiveZipFileName(project.title, projectId);
    this.log?.audit?.("project.asset.archive.exported", {
      projectId,
      exported,
      skipped,
      filename,
      bytes: buffer.length,
    });
    return { buffer, filename, exported, skipped };
  }

  async importZip(projectId: number, zipPath: string): Promise<AssetArchiveImportResult> {
    if (!this.db.prepare("SELECT id FROM dramas WHERE id = ?").get(projectId)) {
      throw new NotFoundError("项目不存在");
    }
    const raw = await fs.promises.readFile(zipPath);
    const zip = await JSZip.loadAsync(raw);
    const created: ProjectAssetRow[] = [];
    let skipped = 0;

    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .sort((a, b) => a.name.localeCompare(b.name, "zh"));

    for (const entry of entries) {
      const parsed = parseArchiveImageEntry(entry.name);
      if (!parsed) {
        skipped += 1;
        continue;
      }
      const bytes = Buffer.from(await entry.async("nodebuffer"));
      if (!bytes.length) {
        skipped += 1;
        continue;
      }

      const tempPath = path.join(
        this.storageRoot,
        "uploads",
        `asset-import-${projectId}-${Date.now()}-${created.length}${parsed.ext}`,
      );
      await fs.promises.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.promises.writeFile(tempPath, bytes);

      try {
        const asset = this.assets.createProjectAsset(projectId, {
          kind: parsed.kind,
          name: parsed.name,
        });
        await this.images.importLocal({
          dramaId: projectId,
          projectAssetId: asset.id,
          sourcePath: tempPath,
          prompt: "资产图存档导入",
        });
        const refreshed = this.assets.getProjectAsset(asset.id);
        if (refreshed) created.push(refreshed);
      } finally {
        await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
      }
    }

    if (created.length === 0) {
      throw new ValidationError("ZIP 中没有可导入的资产图（需要 角色卡/场景卡/道具卡 下的图片）");
    }

    this.log?.audit?.("project.asset.archive.imported", {
      projectId,
      imported: created.length,
      skipped,
    });
    return { created, imported: created.length, skipped };
  }

  private resolveLocalImagePath(asset: ProjectAssetRow): string | null {
    if (asset.local_path && this.mediaArchive.isAvailable(asset.local_path)) {
      return path.resolve(this.storageRoot, asset.local_path.replace(/[\\/]+/gu, path.sep));
    }
    const url = asset.image_url?.trim() ?? "";
    if (!url.startsWith("/static/")) return null;
    const relative = decodeURIComponent(url.slice("/static/".length));
    if (!this.mediaArchive.isAvailable(relative)) return null;
    return path.resolve(this.storageRoot, relative.replace(/[\\/]+/gu, path.sep));
  }
}
