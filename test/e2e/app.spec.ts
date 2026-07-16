import { expect, test } from '@playwright/test';

test('ホームから試合を開始して公開／GM視点とリプレイを表示できる', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'AI人狼' })).toBeVisible();
  await expect(page.getByRole('button', { name: '♫ BGM ON' })).toBeVisible();
  await expect(page.getByLabel('BGM音量')).toBeVisible();
  await expect(page.getByLabel('BGM音量')).toHaveValue('70');
  await page.getByLabel('BGM音量').fill('85');
  await page.getByText('最速').click();
  await page.getByRole('button', { name: /AI人狼を開始/ }).click();
  await expect(page).toHaveURL(/\/match\//);
  await expect(page.getByRole('heading', { name: 'Agent 1' })).toBeVisible();
  await expect(page.getByAltText('Agent 1の立ち絵')).toBeVisible();
  await expect(page.getByText('冷静な調停役')).toBeVisible();
  await expect(page.getByRole('button', { name: /VOICE ON/ })).toBeVisible();
  await expect(page.getByLabel('VOICE音量')).toBeVisible();
  await expect(page.getByLabel('VOICE音量')).toHaveValue('90');
  await page.getByLabel('VOICE音量').fill('75');
  await page.getByRole('button', { name: /VOICE ON/ }).click();
  await expect(page.getByRole('button', { name: /VOICE OFF/ })).toBeVisible();
  await page.getByRole('button', { name: 'GM視点' }).click();
  await expect(page.getByText(/村人|人狼|占い師|霊媒師|狩人|狂人/).first()).toBeVisible();
  await expect(page.getByText('GAME SET')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'リプレイを見る →' })).toBeVisible();
  const replayUrl = page.url().replace('/match/', '/replay/');
  await page.goto(replayUrl);
  await expect(page.getByLabel('リプレイ位置')).toBeVisible();
});

test('Spaceキーで一時停止・再開し、中断できる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /AI人狼を開始/ }).click();
  await expect(page).toHaveURL(/\/match\//);
  await expect(page.getByRole('heading', { name: 'Agent 1' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('PAUSED')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('LIVE')).toBeVisible();
  await page.getByRole('button', { name: '中断' }).click();
  await expect(page.getByText('ABORTED')).toBeVisible();
});
