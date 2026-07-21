import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('キャラクターJSONと立ち絵をドラッグ＆ドロップでき、JSONの不備をフィールド別に表示する', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/characters');
  await expect(page.getByRole('heading', { name: 'キャラクター編集' })).toBeVisible({ timeout: 30_000 });

  const presetInput = page.locator('input[type="file"][accept*="application/json"]');
  await presetInput.setInputFiles({
    name: 'broken.character.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ seat: 'seat-1' })),
  });
  await expect(page.locator('.editor-message.error')).toContainText('JSONプリセットに');
  await expect(page.locator('.editor-message.error')).toContainText('name: 必須フィールドがないか、値の型が違います。');
  await expect(page.locator('.editor-message.error')).toContainText('portraitSrc: 必須フィールドがないか、値の型が違います。');

  const character = await page.evaluate(async () => {
    const response = await fetch('/api/characters');
    const data = await response.json() as { characters: Array<Record<string, unknown>> };
    const source = data.characters[0];
    const tts = source.tts as { provider: string; voice: Record<string, unknown> };
    return { ...source, seat: '', addressBook: {}, tts: { ...tts, voice: { ...tts.voice, seat: '' } }, name: '検証済みキャラクター' };
  });
  await page.locator('.character-roster button').nth(1).click();
  await expect(page.locator('.character-roster button').nth(1)).toHaveClass(/active/);
  const presetDataTransfer = await page.evaluateHandle((preset) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([JSON.stringify(preset)], 'valid.character.json', { type: 'application/json' }));
    return dataTransfer;
  }, character);
  const presetDropZone = page.locator('.preset-drop-zone');
  await presetDropZone.dispatchEvent('dragenter', { dataTransfer: presetDataTransfer });
  await expect(presetDropZone).toHaveClass(/drag-active/);
  await presetDropZone.dispatchEvent('drop', { dataTransfer: presetDataTransfer });
  await expect(page.locator('.editor-message.success')).toContainText('席未指定のプリセットを選択中のSLOT 2へ');
  await expect(page.locator('.editor-message.success')).toContainText('試合での席は開始時に決まります。');
  await expect(page.locator('.character-roster button').nth(1)).toHaveClass(/active/);
  await expect(page.locator('.character-preview')).toContainText('SLOT 2');
  await expect(page.getByLabel('名前')).toHaveValue('検証済みキャラクター');
  await page.getByLabel('キャラクターの言語モデル').selectOption('gemini');
  await page.getByLabel('キャラクターのGemini思考トークン予算').selectOption('4096');
  await page.getByLabel('キャラクターの音声エンジン').selectOption('aivisspeech');
  await expect(page.getByLabel('キャラクターの言語モデル')).toHaveValue('gemini');
  await expect(page.getByLabel('キャラクターのGemini思考トークン予算')).toHaveValue('4096');
  await expect(page.getByLabel('キャラクターの音声エンジン')).toHaveValue('aivisspeech');
  await page.getByText('他の8人への呼び方').click();
  await page.getByLabel('個別設定がない相手の呼び方').selectOption('given_name_chan');
  await expect(page.getByLabel('個別設定がない相手の呼び方')).toHaveValue('given_name_chan');

  const portraitDataTransfer = await page.evaluateHandle(() => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([bytes], 'portrait.png', { type: 'image/png' }));
    return dataTransfer;
  });
  const portraitDropZone = page.locator('.portrait-drop-zone');
  await portraitDropZone.dispatchEvent('dragenter', { dataTransfer: portraitDataTransfer });
  await expect(portraitDropZone).toHaveClass(/drag-active/);
  await portraitDropZone.dispatchEvent('drop', { dataTransfer: portraitDataTransfer });
  await expect(portraitDropZone.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);

  const saveRequestPromise = page.waitForRequest((request) => request.url().endsWith('/api/characters') && request.method() === 'PUT');
  await page.getByRole('button', { name: '変更を保存' }).click();
  const saveRequest = await saveRequestPromise;
  expect(saveRequest.postDataJSON().character.seat).toBe('seat-2');
  expect(saveRequest.postDataJSON().character.defaultAddressStyle).toBe('given_name_chan');
  await expect(page.locator('.editor-message.success')).toContainText('検証済みキャラクターの設定を保存しました。');
  const savedRoster = await page.evaluate(async () => {
    const response = await fetch('/api/characters');
    return (await response.json() as { characters: Array<{ seat: string; name: string; defaultAddressStyle: string }> }).characters;
  });
  expect(savedRoster.find((item) => item.seat === 'seat-2')?.name).toBe('検証済みキャラクター');
  expect(savedRoster.find((item) => item.seat === 'seat-2')?.defaultAddressStyle).toBe('given_name_chan');
  expect(savedRoster.find((item) => item.seat === 'seat-1')?.name).not.toBe('検証済みキャラクター');
  await page.evaluate(async () => {
    await fetch('/api/characters', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seat: 'seat-2' }),
    });
  });
});

test('ホームから試合を開始して公開／GM視点とリプレイを表示できる', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'AI人狼' })).toBeVisible();
  await expect(page.getByRole('button', { name: '♫ BGM ON' })).toBeVisible();
  await expect(page.getByLabel('BGM音量')).toBeVisible();
  await expect(page.getByLabel('BGM音量')).toHaveValue('70');
  await expect(page.getByLabel('言語モデル')).toHaveCount(0);
  await expect(page.getByLabel('音声エンジン')).toHaveCount(0);
  await expect(page.getByText('9人それぞれの保存済みキャラクター設定を使用します。')).toBeVisible();
  await page.getByLabel('BGM音量').fill('85');
  await page.getByLabel(/SEED/).fill('fixture-0');
  await page.getByText('最速').click();
  await page.getByRole('button', { name: /AI人狼を開始/ }).click();
  await expect(page).toHaveURL(/\/match\//, { timeout: 45_000 });
  await expect(page.locator('.cinematic-overlay')).toContainText('第0夜', { timeout: 15_000 });
  await expect(page.locator('.cinematic-overlay')).toContainText('1日目', { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: '名取 澪' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '？ ルール' }).click();
  await expect(page.getByRole('dialog', { name: '観戦ガイド' })).toBeVisible();
  await expect(page.getByRole('button', { name: '観戦ガイドを閉じる' })).toBeFocused();
  await expect(page.getByRole('heading', { name: '9人の配役' })).toBeVisible();
  await expect(page.getByText('狂人 ×1')).toBeVisible();
  await expect(page.getByText('公開視点', { exact: true }).last()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '観戦ガイド' })).toBeHidden();
  await expect(page.getByText(/生存 \d\/9/)).toBeVisible();
  await expect(page.getByAltText('名取 澪の立ち絵')).toBeVisible();
  await expect(page.getByText('恩着せがましい世話焼き')).toBeVisible();
  await expect(page.locator('audio[data-bgm-player="true"]')).toHaveAttribute('src', '/assets/bgm_village.ogg');
  await expect(page.getByRole('button', { name: /VOICE ON/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '◆ SE ON' })).toBeVisible();
  await expect(page.getByLabel('SE音量')).toHaveValue('80');
  await page.getByLabel('SE音量').fill('35');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('werewolf-sfx-volume'))).toBe('0.35');
  await page.getByRole('button', { name: '◆ SE ON' }).click();
  await expect(page.getByRole('button', { name: '◆ SE OFF' })).toBeVisible();
  await page.getByRole('button', { name: '◆ SE OFF' }).click();
  await expect(page.getByLabel('VOICE音量')).toBeVisible();
  await expect(page.getByLabel('VOICE音量')).toHaveValue('90');
  await page.getByLabel('VOICE音量').fill('75');
  await page.getByRole('button', { name: /VOICE ON/ }).click();
  await expect(page.getByRole('button', { name: /VOICE OFF/ })).toBeVisible();
  await page.getByRole('button', { name: 'GM視点' }).click();
  await expect(page.getByText(/村人|人狼|占い師|霊媒師|狩人|狂人/).first()).toBeVisible();
  await expect(page.getByText('GAME SET')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: '全員の正体と結末' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '役職主張' })).toBeVisible();
  await expect(page.getByText('本人の公開主張です。真偽を示しません。')).toBeVisible();
  const claimBoardBox = await page.locator('.claim-board').boundingBox();
  const timelinePanelBox = await page.locator('.timeline-panel').boundingBox();
  expect(claimBoardBox?.x).toBeGreaterThanOrEqual(timelinePanelBox?.x ?? 0);
  expect((claimBoardBox?.x ?? 0) + (claimBoardBox?.width ?? 0)).toBeLessThanOrEqual((timelinePanelBox?.x ?? 0) + (timelinePanelBox?.width ?? 0));
  await expect(page.getByRole('region', { name: '村人陣営の配役' })).toBeVisible();
  await expect(page.getByRole('region', { name: '人狼陣営の配役' })).toBeVisible();
  await expect(page.locator('.epilogue-team li')).toHaveCount(9);
  await expect(page.locator('.epilogue-team li').filter({ hasText: '狂人（判定は人間）' })).toHaveCount(1);
  await expect(page.locator('.epilogue-fate')).toHaveCount(9);
  await expect(page.locator('.timeline-event.dawn').filter({ hasText: '1日目' })).toHaveCount(0);
  await expect(page.locator('.timeline-event.vote_reveal').first()).toContainText('票');
  await expect(page.locator('.timeline-day').first()).toBeVisible();
  await page.getByRole('button', { name: '公開視点' }).click();
  await expect(page.getByText('REVEALED SECRET').first()).toBeVisible();
  await expect(page.locator('.card-vote').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'リプレイを見る →' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('GAME SET')).toBeVisible();
  await expect(page.getByLabel('SE音量')).toHaveValue('35');
  await expect(page.locator('.cinematic-overlay')).toHaveCount(0);
  const replayUrl = page.url().replace('/match/', '/replay/');
  await page.goto(replayUrl);
  await expect(page.getByLabel('リプレイ位置')).toBeVisible();
  await page.getByLabel('リプレイ位置').fill('0');
  await expect(page.getByRole('heading', { name: '全員の正体と結末' })).toHaveCount(0);
  await expect(page.locator('.timeline-event.dawn').filter({ hasText: '1日目' })).toHaveCount(0);
  const voteRevealSeq = await page.evaluate(async () => {
    const matchId = window.location.pathname.split('/').at(-1);
    const response = await fetch(`/api/match/${matchId}?view=public`);
    const data = await response.json() as { events: Array<{ seq: number; type: string }> };
    return data.events.find((event) => event.type === 'vote_reveal')?.seq ?? 0;
  });
  await page.getByLabel('リプレイ位置').fill(String(voteRevealSeq));
  await expect(page.locator('.cinematic-overlay')).toContainText('開票', { timeout: 15_000 });
});

test('Spaceキーでゲームと発言音声を一時停止・再開し、中断できる', async ({ page }) => {
  test.setTimeout(90_000);
  const voiceAudio = await readFile('public/assets/bgm_village.ogg');
  let ttsPostCount = 0;
  await page.route('**/api/tts**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { available: true } });
      return;
    }
    ttsPostCount += 1;
    await route.fulfill({ status: 200, contentType: 'audio/ogg', body: voiceAudio });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /AI人狼を開始/ }).click();
  await expect(page).toHaveURL(/\/match\//, { timeout: 45_000 });
  await expect(page.locator('.cinematic-overlay')).toContainText('第0夜', { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: '名取 澪', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.agent-card.speaking')).toHaveCount(0);
  await expect(page.locator('.cinematic-overlay')).toContainText('1日目', { timeout: 15_000 });
  await expect(page.locator('.agent-card.speaking')).toHaveCount(0);
  await expect(page.locator('.cinematic-overlay')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.viewer-shell')).toHaveClass(/day/);
  await expect(page.locator('.agent-card.speaking')).toHaveCount(1, { timeout: 30_000 });
  await expect.poll(() => ttsPostCount).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('region', { name: '注目中の発言' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const speakingName = document.querySelector('.agent-card.speaking h2')?.textContent;
    const speakingText = document.querySelector('.agent-card.speaking blockquote')?.textContent;
    const stageName = document.querySelector('.speaker-stage h2')?.textContent;
    const stageText = document.querySelector('.speaker-stage blockquote')?.textContent;
    return Boolean(speakingName && speakingText && stageName?.includes(speakingName) && stageText?.includes(speakingText));
  })).toBe(true);
  const speakerStageBox = await page.locator('.speaker-stage').boundingBox();
  const controlDockBox = await page.locator('.control-dock').boundingBox();
  const lastAgentBox = await page.locator('.agent-card').last().boundingBox();
  await expect(page.locator('.agent-card')).toHaveCount(9);
  expect(speakerStageBox?.height).toBeLessThanOrEqual(134);
  expect((speakerStageBox?.y ?? 0) + (speakerStageBox?.height ?? 0)).toBeLessThanOrEqual(controlDockBox?.y ?? 0);
  expect((lastAgentBox?.y ?? 0) + (lastAgentBox?.height ?? 0)).toBeLessThanOrEqual(controlDockBox?.y ?? 0);
  await expect(page.locator('.vote-panel')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(page.locator('.round-status em')).toHaveText('PAUSED', { timeout: 15_000 });
  await expect(page.locator('.agent-card.speaking')).toHaveCount(0);
  await expect(page.locator('.speaker-stage')).toHaveClass(/paused/);
  await expect(page.locator('.speaker-stage')).toContainText('PAUSED');
  const pausedEventCount = await page.locator('.timeline-event').count();
  await page.waitForTimeout(1_200);
  await expect(page.locator('.timeline-event')).toHaveCount(pausedEventCount);
  await page.keyboard.press('Space');
  await expect(page.locator('.round-status em')).toHaveText('LIVE', { timeout: 15_000 });
  await expect(page.locator('.agent-card.speaking')).toHaveCount(1);
  await page.getByRole('button', { name: '中断' }).click();
  await expect(page.getByText('ABORTED')).toBeVisible();
});

test('発言終了後は1秒待ってから次の話者へ進む', async ({ page }) => {
  test.setTimeout(60_000);
  const voiceAudio = await readFile('public/assets/sfx_execution.ogg');
  await page.addInitScript(() => {
    const state = window as typeof window & { __ttsPlayTimes: number[] };
    state.__ttsPlayTimes = [];
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play() {
      if (this.src.startsWith('blob:')) state.__ttsPlayTimes.push(performance.now());
      return originalPlay.call(this);
    };
  });
  await page.route('**/api/tts**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { available: true } });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'audio/ogg', body: voiceAudio });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /AI人狼を開始/ }).click();
  await expect(page).toHaveURL(/\/match\//, { timeout: 45_000 });
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __ttsPlayTimes: number[] }).__ttsPlayTimes.length), { timeout: 45_000 })
    .toBeGreaterThanOrEqual(2);
  const playTimes = await page.evaluate(() =>
    (window as typeof window & { __ttsPlayTimes: number[] }).__ttsPlayTimes);
  expect(playTimes[1] - playTimes[0]).toBeGreaterThanOrEqual(1_100);
});
