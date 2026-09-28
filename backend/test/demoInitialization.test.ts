import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { initializeNailongBackroomsDemo, nailongBackroomsDemoComplete } from '../scripts/nailongBackroomsDemoRuntime';
import { initializeDatabase } from '../src/db/schema';
import { providerRegistry } from '../src/providers';
import { createServices } from '../src/services/container';
import type { AppConfig, Logger } from '../src/types/core';

test('accept:nailong-backrooms-demo 只复用初始化入口，不保留供应商执行脚本', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  assert.equal(packageJson.scripts?.['accept:nailong-backrooms-demo'], 'tsx scripts/initializeNailongBackroomsDemo.ts');
  assert.equal(fs.existsSync(path.resolve('scripts/acceptRainyNightDemo.ts')), false);
});

test('半成品 Demo 会原位补齐为结构化漫画工作区且重复初始化不创建第二个项目', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'potato-demo-init-'));
  const db = new Database(path.join(root, 'demo.db'));
  try {
    initializeDatabase(db);
    const config: AppConfig = {
      app: { name: 'demo-test', version: '1' },
      server: {},
      database: { path: path.join(root, 'demo.db') },
      storage: { local_path: path.join(root, 'storage') },
    };
    const logger: Logger = { info() {}, warn() {}, error() {}, audit() {} };
    const services = createServices(db, config, providerRegistry, logger);
    const half = services.projects.create({
      title: '半成品 Demo',
      metadata: {
        demo: true,
        demo_contract: 'legacy-workspace',
      },
    });

    const repaired = initializeNailongBackroomsDemo(db, services, logger);
    assert.equal(repaired.id, half.id);
    assert.equal(nailongBackroomsDemoComplete(repaired), true);
    assert.equal(repaired.title, '奶龙');
    assert.equal(services.projects.list({ page: 1, pageSize: 20 }).total, 1);
    assert.equal(repaired.project_assets?.length, 1);
    assert.equal(repaired.episodes?.[0]?.panels?.length, 0);
    assert.deepEqual(
      new Set(repaired.project_assets?.map((asset) => `${asset.kind}:${asset.name}`)),
      new Set([
        'character:角色卡-奶龙-06',
      ]),
    );
    const byName = new Map((repaired.project_assets ?? []).map((asset) => [asset.name, asset]));
    assert.equal(byName.get('角色卡-奶龙-06')?.output_type, 'character-layout-f');
    for (const asset of repaired.project_assets ?? []) {
      assert.equal(asset.kind, 'character');
      assert.deepEqual(asset.text_profile, {});
      assert.equal(asset.output_prompt, '');
      assert.deepEqual(asset.input_reference_images, []);
    }
    assert.equal(repaired.episodes?.[0]?.title, '第 1 话');

    const repeated = initializeNailongBackroomsDemo(db, services, logger);
    assert.equal(repeated.id, half.id);
    assert.equal(services.projects.list({ page: 1, pageSize: 20 }).total, 1);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
