import type { Logger, SQLiteDatabase } from '../src/types/core';
import type { Drama } from '../src/types/domain';
import type { ServiceContainer } from '../src/services/container';
import { NAILONG_BACKROOMS_DEMO } from '../../frontend/src/features/production/nailongBackroomsDemoDefinition';

export function initializeNailongBackroomsDemo(
  db: SQLiteDatabase,
  services: ServiceContainer,
  log?: Logger,
): Drama {
  log?.audit?.('demo.nailong-backrooms.initialize.started', {
    demoContract: NAILONG_BACKROOMS_DEMO.contract,
  });
  const initialize = db.transaction(() => {
    const existing = services.projects.list({ page: 1, pageSize: 200 }).items;
    const demo = existing.find((item) => item.metadata.demo === true);
    if (!demo && existing.length) {
      throw new Error('数据库中已有项目；为避免覆盖，请在空数据库上运行 Demo 初始化脚本。');
    }
    if (demo && nailongBackroomsDemoComplete(services.projects.require(demo.id))) {
      return services.projects.require(demo.id);
    }
    const definition = {
      ...NAILONG_BACKROOMS_DEMO.project,
      metadata: {
        aspect_ratio: NAILONG_BACKROOMS_DEMO.media.aspectRatio,
        demo: true,
        demo_contract: NAILONG_BACKROOMS_DEMO.contract,
        prewritten_text: true,
      },
    };
    const project = demo
      ? services.projects.update(demo.id, definition)
      : services.projects.create(definition);
    const episode = services.projects.saveEpisodes(project.id, [{
      episode_number: 1,
      title: '第 1 话',
      duration: Math.max(1, NAILONG_BACKROOMS_DEMO.panels.length) * NAILONG_BACKROOMS_DEMO.media.duration,
      script_content: NAILONG_BACKROOMS_DEMO.script,
      ...NAILONG_BACKROOMS_DEMO.episodePlan,
    }])[0];
    if (!episode) throw new Error('Demo 话初始化失败。');

    const desiredNames = new Set([
      ...NAILONG_BACKROOMS_DEMO.characters.map((item) => `character:${item.name}`),
      ...NAILONG_BACKROOMS_DEMO.scenes.map((item) => `scene:${item.location}`),
      ...NAILONG_BACKROOMS_DEMO.props.map((item) => `prop:${item.name}`),
    ]);
    for (const asset of services.assets.listProjectAssets(project.id)) {
      if (!desiredNames.has(`${asset.kind}:${asset.name}`)) {
        services.assets.deleteProjectAsset(asset.id);
      }
    }

    const projectAssets = [
      ...NAILONG_BACKROOMS_DEMO.characters.map((item) => ({
        kind: 'character' as const,
        name: item.name,
        text_profile: { ...item.text_profile },
        output_type: item.output_type,
        output_prompt: item.output_prompt,
        input_reference_images: [] as string[],
      })),
      ...NAILONG_BACKROOMS_DEMO.scenes.map((item) => ({
        kind: 'scene' as const,
        name: item.location,
        text_profile: { ...item.text_profile },
        output_type: 'scene-panorama' as const,
        output_prompt: item.output_prompt,
        input_reference_images: [] as string[],
      })),
      ...NAILONG_BACKROOMS_DEMO.props.map((item) => ({
        kind: 'prop' as const,
        name: item.name,
        text_profile: { ...item.text_profile },
        output_type: 'prop-multi-angle' as const,
        output_prompt: item.output_prompt,
        input_reference_images: [] as string[],
      })),
    ].map((item) => {
      const bound = services.assets.listProjectAssets(project.id, item.kind).find((candidate) => candidate.name === item.name)
        ?? services.assets.createProjectAsset(project.id, item);
      return services.assets.updateProjectAsset(bound.id, item);
    });
    const assetIds = new Map(projectAssets.map((item) => [`${item.kind}:${item.name}`, item.id]));
    services.assets.syncPanels(episode.id, NAILONG_BACKROOMS_DEMO.panels.map((item) => ({
      ...item,
      project_asset_ids: [
        ...item.characters.map((name) => assetIds.get(`character:${name}`)),
        ...item.scenes.map((name) => assetIds.get(`scene:${name}`)),
        ...item.props.map((name) => assetIds.get(`prop:${name}`)),
      ].filter((id): id is number => Boolean(id)),
    })));
    return services.projects.require(project.id);
  });

  const project = initialize();
  log?.audit?.('demo.nailong-backrooms.initialize.completed', {
    projectId: project.id,
    demoContract: NAILONG_BACKROOMS_DEMO.contract,
    projectAssets: project.project_assets?.length ?? 0,
    panels: project.episodes?.[0]?.panels?.length ?? 0,
  });
  return project;
}

export function nailongBackroomsDemoComplete(project: Drama): boolean {
  const expectedAssets = NAILONG_BACKROOMS_DEMO.characters.length
    + NAILONG_BACKROOMS_DEMO.scenes.length
    + NAILONG_BACKROOMS_DEMO.props.length;
  return project.metadata.demo_contract === NAILONG_BACKROOMS_DEMO.contract
    && project.project_assets?.length === expectedAssets
    && (project.episodes?.[0]?.panels?.length ?? 0) === NAILONG_BACKROOMS_DEMO.panels.length;
}

/** @deprecated 旧名 */
export const initializeQueenAccessionDemo = initializeNailongBackroomsDemo;
/** @deprecated 旧名 */
export const queenAccessionDemoComplete = nailongBackroomsDemoComplete;
