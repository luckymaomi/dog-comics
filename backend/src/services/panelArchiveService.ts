import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { NotFoundError, ValidationError } from "../errors";
import type { AppConfig, Logger, SQLiteDatabase } from "../types/core";
import type { PanelRow } from "../types/domain";
import type { AssetRepository } from "./assetRepository";
import type { ImageGenerationService } from "./imageGenerationService";
import type { MediaArchiveService } from "./mediaArchiveService";
import {
  PANEL_FOLDER,
  extensionFromPathOrMime,
  panelArchiveBaseName,
  panelArchiveZipFileName,
  parsePanelArchiveImageEntry,
  sanitizeArchiveBaseName,
  uniqueArchiveFileName,
} from "./panelArchiveFormat";

export interface PanelArchiveExportResult {
  buffer: Buffer;
  filename: string;
  exported: number;
  skipped: number;
}

export interface PanelArchiveImportResult {
  created: PanelRow[];
  imported: number;
  skipped: number;
}

export class PanelArchiveService {
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

  async exportZip(projectId: number, episodeId: number): Promise<PanelArchiveExportResult> {
    const project = this.db
      .prepare("SELECT id, title FROM dramas WHERE id = ?")
      .get(projectId) as { id: number; title: string } | undefined;
    if (!project) throw new NotFoundError("项目不存在");

    const episode = this.db
      .prepare("SELECT id, drama_id, episode_number FROM episodes WHERE id = ?")
      .get(episodeId) as
      | { id: number; drama_id: number; episode_number: number }
      | undefined;
    if (!episode || episode.drama_id !== projectId) {
      throw new NotFoundError("话不存在");
    }

    const zip = new JSZip();
    zip.folder(PANEL_FOLDER);

    const usedNames = new Set<string>();
    let exported = 0;
    let skipped = 0;
    const list = this.assets.listPanels(episodeId);

    for (const panel of list) {
      const absolute = this.resolveLocalImagePath(panel);
      if (!absolute) {
        skipped += 1;
        continue;
      }
      const bytes = await fs.promises.readFile(absolute);
      const ext = extensionFromPathOrMime(absolute);
      const base = panelArchiveBaseName(panel.panel_number, panel.title);
      const fileName = uniqueArchiveFileName(base, ext, usedNames);
      zip.file(`${PANEL_FOLDER}/${fileName}`, bytes);
      exported += 1;
    }

    if (exported === 0) {
      throw new ValidationError("当前话没有可导出的本地分镜底板图");
    }

    const buffer = Buffer.from(
      await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    );
    const filename = panelArchiveZipFileName(
      project.title,
      projectId,
      episode.episode_number,
    );
    this.log?.audit?.("project.panel.archive.exported", {
      projectId,
      episodeId,
      exported,
      skipped,
      filename,
      bytes: buffer.length,
    });
    return { buffer, filename, exported, skipped };
  }

  async importZip(
    projectId: number,
    episodeId: number,
    zipPath: string,
  ): Promise<PanelArchiveImportResult> {
    const project = this.db
      .prepare("SELECT id FROM dramas WHERE id = ?")
      .get(projectId) as { id: number } | undefined;
    if (!project) throw new NotFoundError("项目不存在");

    const episode = this.db
      .prepare("SELECT id, drama_id FROM episodes WHERE id = ?")
      .get(episodeId) as { id: number; drama_id: number } | undefined;
    if (!episode || episode.drama_id !== projectId) {
      throw new NotFoundError("话不存在");
    }

    const raw = await fs.promises.readFile(zipPath);
    const zip = await JSZip.loadAsync(raw);
    const created: PanelRow[] = [];
    let skipped = 0;

    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .sort((a, b) => a.name.localeCompare(b.name, "zh"));

    for (const entry of entries) {
      const parsed = parsePanelArchiveImageEntry(entry.name);
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
        `panel-import-${projectId}-${Date.now()}-${created.length}${parsed.ext}`,
      );
      await fs.promises.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.promises.writeFile(tempPath, bytes);

      try {
        const title = sanitizeArchiveBaseName(parsed.title, "未命名");
        const panel = this.assets.createPanel({
          episode_id: episodeId,
          title,
        });
        await this.images.importLocal({
          dramaId: projectId,
          panelId: panel.id,
          sourcePath: tempPath,
          prompt: "分镜存档导入",
        });
        const refreshed = this.assets.getPanel(panel.id);
        if (refreshed) created.push(refreshed);
      } finally {
        await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
      }
    }

    if (created.length === 0) {
      throw new ValidationError("ZIP 中没有可导入的分镜图（需要 分镜/ 下的图片）");
    }

    this.log?.audit?.("project.panel.archive.imported", {
      projectId,
      episodeId,
      imported: created.length,
      skipped,
    });
    return { created, imported: created.length, skipped };
  }

  /** 只取当前选用指针对应的本地底板；无本地文件则不可导出（不含历史 generation）。 */
  private resolveLocalImagePath(panel: PanelRow): string | null {
    if (panel.current_image_generation_id) {
      const generation = this.db
        .prepare("SELECT local_path, image_url, status FROM image_generations WHERE id = ?")
        .get(panel.current_image_generation_id) as
        | { local_path: string | null; image_url: string | null; status: string }
        | undefined;
      if (generation?.local_path && this.mediaArchive.isAvailable(generation.local_path)) {
        return path.resolve(
          this.storageRoot,
          generation.local_path.replace(/[\\/]+/gu, path.sep),
        );
      }
      const genUrl = generation?.image_url?.trim() ?? "";
      if (genUrl.startsWith("/static/")) {
        const relative = decodeURIComponent(genUrl.slice("/static/".length));
        if (this.mediaArchive.isAvailable(relative)) {
          return path.resolve(this.storageRoot, relative.replace(/[\\/]+/gu, path.sep));
        }
      }
    }

    const url = panel.image_url?.trim() ?? "";
    if (!url.startsWith("/static/")) return null;
    const relative = decodeURIComponent(url.slice("/static/".length));
    if (!this.mediaArchive.isAvailable(relative)) return null;
    return path.resolve(this.storageRoot, relative.replace(/[\\/]+/gu, path.sep));
  }
}
