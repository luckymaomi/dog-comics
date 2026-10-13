import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  MediaArchiveService,
  promptSidecarRelativePath,
} from '../src/services/mediaArchiveService';

test('promptSidecarRelativePath 与媒体同目录同基名', () => {
  assert.equal(
    promptSidecarRelativePath('projects/2/images/124.png'),
    'projects/2/images/124.prompt.txt',
  );
  assert.equal(
    promptSidecarRelativePath('projects/2/images/124.webp'),
    'projects/2/images/124.prompt.txt',
  );
});

test('writePromptSidecar 落盘且 remove 时一并删除', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dog-comics-prompt-sidecar-'));
  try {
    const archive = new MediaArchiveService({
      app: { name: 'test', version: '0' },
      server: {},
      database: { path: ':memory:' },
      storage: { local_path: root },
    });
    const mediaRelative = 'projects/9/images/77.png';
    const mediaAbs = archive.absolutePath(mediaRelative);
    fs.mkdirSync(path.dirname(mediaAbs), { recursive: true });
    fs.writeFileSync(mediaAbs, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    archive.writePromptSidecar(mediaRelative, '  角色卡提示词一行  ');
    const sidecarAbs = archive.absolutePath('projects/9/images/77.prompt.txt');
    assert.equal(fs.readFileSync(sidecarAbs, 'utf8'), '角色卡提示词一行\n');
    await archive.remove(mediaRelative);
    assert.equal(fs.existsSync(mediaAbs), false);
    assert.equal(fs.existsSync(sidecarAbs), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
