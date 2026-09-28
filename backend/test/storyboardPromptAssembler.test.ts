import assert from 'node:assert/strict';
import test from 'node:test';
import { assemblePanelRecipe } from '../src/services/storyboardPromptAssembler';
import type { PanelRow, ProjectAssetRow } from '../src/types/domain';

const panel = (overrides: Partial<PanelRow> = {}): PanelRow => ({
  id: 1, episode_id: 1, panel_number: 1, title: '雾中的码头', description: '林岚在雾港码头发现一封信', action: '拆开信封', image_prompt: '电影感悬疑画面', image_recipe_prompt: '', image_recipe_references: [], image_url: null, current_image_generation_id: null, project_asset_ids: [7], extra_reference_images: ['https://cdn.test/pose.png'], created_at: '', updated_at: '', ...overrides,
});

const character: ProjectAssetRow = {
  id: 7, drama_id: 1, kind: 'character', name: '林岚', text_profile: { brief: '调查记者风衣' },
  output_type: 'character-layout-a', output_prompt: '定妆布局 A', input_reference_images: ['https://cdn.test/upload-face.png'],
  image_url: 'https://cdn.test/linlan.png', local_path: null, current_image_generation_id: null, created_at: '', updated_at: '',
};
const scene: ProjectAssetRow = {
  id: 8, drama_id: 1, kind: 'scene', name: '雾港', text_profile: { brief: '海雾码头' },
  output_type: 'scene-panorama', output_prompt: '空间全景模板', input_reference_images: [],
  image_url: 'https://cdn.test/harbor.png', local_path: null, current_image_generation_id: null, created_at: '', updated_at: '',
};
const prop: ProjectAssetRow = {
  id: 9, drama_id: 1, kind: 'prop', name: '信封', text_profile: { brief: '羊皮信' },
  output_type: 'prop-multi-angle', output_prompt: '多角度模板', input_reference_images: [],
  image_url: 'https://cdn.test/letter.png', local_path: null, current_image_generation_id: null, created_at: '', updated_at: '',
};

test('分镜配方拼本镜画面与按 kind 的锁点段，参考图挂资产标准图与其他参考图', () => {
  const result = assemblePanelRecipe({
    shot: panel({ project_asset_ids: [7, 8, 9] }),
    assets: [character, scene, prop],
  });
  assert.match(result.panelRecipe.prompt, /^拆开信封\n/);
  assert.match(result.panelRecipe.prompt, /图片参考锁定（锁脸）：基于出场角色卡「林岚」的当前标准图为唯一面部身份锚点/);
  assert.match(result.panelRecipe.prompt, /图片参考锁定（锁景）：基于出场场景卡「雾港」的当前标准图为唯一场景锚点/);
  assert.match(result.panelRecipe.prompt, /图片参考锁定（锁物）：基于出场道具卡「信封」的当前标准图为唯一道具锚点/);
  assert.match(result.panelRecipe.prompt, /干净画面；无字幕、无气泡、无水印$/);
  assert.equal(/调查记者风衣|定妆布局|空间全景模板|upload-face/u.test(result.panelRecipe.prompt), false);
  assert.deepEqual(result.panelRecipe.references, [
    'https://cdn.test/linlan.png',
    'https://cdn.test/harbor.png',
    'https://cdn.test/letter.png',
    'https://cdn.test/pose.png',
  ]);
});

test('分镜配方不注入总览画风锁或资产档案/出图提示词', () => {
  const result = assemblePanelRecipe({
    shot: panel({ action: '回眸而立', project_asset_ids: [7] }),
    assets: [character],
  });
  assert.equal(/基调|参考设定|服装：调查记者风衣|定妆布局|视觉描述/u.test(result.panelRecipe.prompt), false);
  assert.match(result.panelRecipe.prompt, /^回眸而立\n图片参考锁定（锁脸）/);
  assert.match(result.panelRecipe.prompt, /干净画面；无字幕、无气泡、无水印$/);
});

test('出场资产尚无标准图时仍写出锁点并提示缺图，参考图不含空项', () => {
  const result = assemblePanelRecipe({
    shot: panel({ action: '侧身站立', project_asset_ids: [7], extra_reference_images: [] }),
    assets: [{ ...character, image_url: null }],
  });
  assert.match(result.panelRecipe.prompt, /当前卡尚无标准图，生成前请先产出标准图/);
  assert.deepEqual(result.panelRecipe.references, []);
});

test('空规格仍产出可执行的图片配方', () => {
  const result = assemblePanelRecipe({
    shot: panel({
      description: '一个人站在码头',
      image_prompt: null,
      action: null,
      project_asset_ids: [],
      extra_reference_images: [' https://cdn.test/light.png ', 'https://cdn.test/light.png'],
    }),
    assets: [],
  });
  assert.deepEqual(result.panelRecipe, {
    prompt: '一个人站在码头\n干净画面；无字幕、无气泡、无水印',
    references: ['https://cdn.test/light.png'],
  });
});
