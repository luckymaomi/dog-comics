import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assembleAssetOutputPrompt,
  normalizeBanImageText,
  normalizeReferenceLock,
} from '../src/services/assetOutputPromptAssembler';
import type { AssetOutputType, ProjectAssetRow } from '../src/types/domain';

function asset(
  outputType: AssetOutputType,
  referenceLock: 'face' | 'scene' | 'prop' | null = null,
  banImageText: 'ban' | null = null,
  inputReferences: string[] = [],
): ProjectAssetRow & {
  reference_lock: 'face' | 'scene' | 'prop' | null;
  ban_image_text: 'ban' | null;
} {
  const kind = outputType.startsWith('character-')
    ? 'character'
    : outputType.startsWith('scene-') ? 'scene' : 'prop';
  return {
    id: 1,
    drama_id: 1,
    kind,
    name: kind === 'character' ? '红女王（加冕）' : kind === 'scene' ? '黑曜王厅（烛光）' : '红宝石王冠（破损）',
    text_profile: kind === 'character'
      ? { brief: '黑色盘发；深红加冕礼服' }
      : kind === 'scene'
        ? { brief: '中轴王座厅；深夜烛火' }
        : { brief: '暗金与红宝石；左侧冠齿破损' },
    output_type: outputType,
    output_prompt: '测试提示词',
    input_reference_images: inputReferences,
    image_url: null,
    local_path: null,
    current_image_generation_id: null,
    created_at: '',
    updated_at: '',
    reference_lock: referenceLock,
    ban_image_text: banImageText,
  };
}

test('未选图片参考锁定时不组装锁定段', () => {
  assert.equal(normalizeReferenceLock('character', null), null);
  assert.equal(normalizeReferenceLock('character', undefined), null);
  const prompt = assembleAssetOutputPrompt(asset('character-layout-c', null));
  assert.equal(/图片参考锁定|img2img|输入参考图/u.test(prompt), false);
  assert.match(prompt, /产出布局 C/u);
});

test('选中锁脸后显式写入上传参考图数量与锁脸约束', () => {
  const prompt = assembleAssetOutputPrompt(
    asset('character-layout-a', 'face', null, ['/static/uploads/a.png', '/static/uploads/b.png']),
  );
  assert.match(
    prompt,
    /^图片参考锁定（锁脸）：基于我上传的输入参考图（共 2 张）为唯一面部身份锚点，img2img 图生图。严格保持/u,
  );
  assert.equal(/一并发给模型|不另选单张|输入参考图」列表/u.test(prompt), false);
  assert.match(prompt, /发际线与发型轮廓一致/u);
  assert.match(prompt, /左脸右身/u);
});

test('锁脸但尚无参考图时仍显式写出 0 张提示', () => {
  const prompt = assembleAssetOutputPrompt(asset('character-layout-a', 'face'));
  assert.match(prompt, /共 0 张；当前卡尚无输入参考图，生成前请先上传/u);
});

test('场景选锁景、道具选锁物', () => {
  assert.match(
    assembleAssetOutputPrompt(asset('scene-panorama', 'scene', null, ['/static/uploads/s.png'])),
    /^图片参考锁定（锁景）：基于我上传的输入参考图（共 1 张）为唯一场景锚点，img2img 图生图。/u,
  );
  assert.match(
    assembleAssetOutputPrompt(asset('prop-multi-angle', 'prop', null, ['/static/uploads/p.png'])),
    /^图片参考锁定（锁物）：基于我上传的输入参考图（共 1 张）为唯一道具锚点，img2img 图生图。/u,
  );
});

test('未选画面禁字时不组装禁字段', () => {
  assert.equal(normalizeBanImageText(null), null);
  assert.equal(normalizeBanImageText(undefined), null);
  const prompt = assembleAssetOutputPrompt(asset('character-layout-a', null, null));
  assert.equal(/禁止出字|可读字符/u.test(prompt), false);
});

test('选中禁止出字后写入锁定段之后、卡面文本之前', () => {
  const prompt = assembleAssetOutputPrompt(asset('character-layout-a', 'face', 'ban', ['/static/a.png']));
  assert.match(
    prompt,
    /^图片参考锁定（锁脸）：[\s\S]*?\n画面约束（禁止出字）：图像中不得出现任何文字/u,
  );
  assert.match(prompt, /水印、招牌字、标签、气泡或其它可读字符/u);
  assert.match(prompt, /产出布局 A/u);
  assert.match(prompt, /左脸右身/u);
});

test('表情 8 格、动作 8 格与叙事九宫格写入对应产出说明', () => {
  const expression = assembleAssetOutputPrompt(asset('character-layout-d'));
  assert.match(expression, /表情 8 格|捧腹大笑/u);
  assert.match(expression, /眯成向下弯的缝|两排圆白牙|紧抱鼓起的大肚子/u);
  assert.match(assembleAssetOutputPrompt(asset('character-layout-e')), /动作 8 格|挥手打招呼/u);
  assert.match(
    assembleAssetOutputPrompt(asset('character-layout-f')),
    /叙事九宫格|3×3|正面全身|侧面全身|背面全身|平淡|悲伤|挥手|坐下|奔跑/u,
  );
  assert.doesNotMatch(assembleAssetOutputPrompt(asset('character-layout-f')), /惊恐|探头张望/u);
});
