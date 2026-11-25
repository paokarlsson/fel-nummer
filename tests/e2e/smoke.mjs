// Röktest: spelar igenom Lottogänget i demoläge (mock-leverantör) med Spola fram.
// Kör: npm run build && npm run e2e
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4179;
const URL = `http://localhost:${PORT}/fel-nummer/?speed=20&debug`;
const out = process.env.SHOTS ?? 'test-results';
mkdirSync(out, { recursive: true });

const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', reject);
  setTimeout(() => reject(new Error('servern startade inte')), 20000);
});

const errors = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());

  await page.goto(URL);
  await page.getByRole('button', { name: 'Nytt spel' }).click();
  await page.getByRole('button', { name: 'Spela demo utan nyckel' }).click();
  await page.getByRole('button', { name: 'Sätt i kortet' }).click();
  await page.getByRole('heading', { name: 'Meddelanden' }).waitFor();

  const skip = async () => {
    await page.getByRole('button', { name: 'Meny' }).click();
    const item = page.getByRole('menuitem', { name: 'Spola fram' });
    if (await item.isDisabled()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      return false;
    }
    await item.click();
    return true;
  };

  let replied = false;
  for (let i = 0; i < 400; i++) {
    const ended = await page.getByText('Fallet närmar sig sitt slut.').count();
    if (ended) break;
    await skip();
    await page.waitForTimeout(150);
    // Svara Rogge en gång och spara honom som kontakt.
    if (!replied && (await page.locator('.row', { hasText: '070-923 40 11' }).count())) {
      replied = true;
      await page.locator('.row', { hasText: '070-923 40 11' }).click();
      await page.getByRole('textbox', { name: 'Sms' }).fill('Hej! Jag tror du har fel nummer.');
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Spara kontakt' }).click();
      await page.getByLabel('Namn').fill('Rogge?');
      await page.getByRole('button', { name: 'Spara', exact: true }).click();
      await page.locator('.msg.in').last().waitFor();
      await page.screenshot({ path: `${out}/chat.png` });
      // Vidarebefordra hans första sms till Matte? Matte finns inte än, så bara öppna arket.
      await page.locator('.msg.in .bubble').first().click();
      await page.getByRole('button', { name: 'Vidarebefordra' }).click();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Tillbaka' }).click();
    }
  }
  await page.screenshot({ path: `${out}/list.png` });
  if (!(await page.getByText('Fallet närmar sig sitt slut.').count())) throw new Error('Kom aldrig fram till slutet');

  await page.getByRole('button', { name: 'Meny' }).click();
  await page.getByRole('menuitem', { name: 'Peka ut…' }).click();
  await page.getByRole('button', { name: 'Åk till stugan först' }).click();
  await page.locator('.pick', { hasText: '070-145 72 60' }).click();
  await page.getByRole('heading', { name: 'Du hade rätt.' }).waitFor();
  await page.screenshot({ path: `${out}/ending.png`, fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Röktest OK');
} catch (e) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 1500));
    console.error('vy:', await page.locator('.app').getAttribute('data-view').catch(() => '?'), 'menyer:', await page.locator('.menu').count(), 'dialoger:', await page.locator('dialog[open]').count());
  }
  console.error(errors.join('\n'));
  process.exitCode = 1;
  throw e;
} finally {
  await browser.close();
  server.kill();
}
