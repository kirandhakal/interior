// Run against a running web app: PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser/wall-workspace.cjs
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const room = { id: 'test-room', name: 'Test room', dimensions: { length: 6, width: 4, height: 3 }, daylight: 'Afternoon',
      walls: Object.fromEntries(['north', 'east', 'south', 'west'].map(id => [id, { color: '#aabbcc', finish: 'Satin' }])),
      openings: [
        { id: 'door', kind: 'Door', wall: 'north', offset: -1.5, width: 0.9, height: 2.1, sill: 0 },
        { id: 'window', kind: 'Window', wall: 'north', offset: 1.2, width: 1.2, height: 1.3, sill: 0.8 },
      ], furniture: [], lights: [], options: [] };
    const outline = [[0, 0], [6, 0], [6, 2], [3, 2], [3, 5], [0, 5]].map(([x, z], i) => ({ x, z, wallId: `wall-${i}` }));
    const custom = { ...room, id: 'custom-room', name: 'L room', openings: [],
      dimensions: { length: 6, width: 5, height: 3, outline },
      walls: Object.fromEntries(outline.map(p => [p.wallId, { color: '#ccbb99', finish: 'Matte' }])) };
    const project = { id: 'browser-test', name: 'Test home', version: 1, updatedAt: new Date().toISOString(), rooms: [room, custom] };
    await page.addInitScript(project => {
      localStorage.setItem('room-paint-studio.projects.v1', JSON.stringify([project]));
      localStorage.setItem('room-paint-studio.last.v1', 'browser/' + project.id);
    }, project);
    await page.goto(process.env.WALL_TEST_URL || 'http://localhost:3001');
    await page.getByRole('heading', { name: 'Test room', exact: true }).waitFor().catch(async error => {
      console.error('Startup errors:', errors, (await page.locator('body').innerText()).slice(0, 1800));
      throw error;
    });
    const originalCanvas = page.locator('.scene-host canvas');
    await originalCanvas.waitFor();
    await originalCanvas.evaluate(canvas => { canvas.dataset.retained = 'original'; });
    await page.getByRole('button', { name: 'Open wall', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Wall workspace' }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Inspect door door' }).count(), 1);
    assert.equal(await dialog.getByRole('button', { name: 'Inspect window window' }).count(), 1);
    await dialog.getByRole('button', { name: 'Inspect window window' }).focus();
    await page.keyboard.press('Enter');
    assert.match(await dialog.getByLabel('Opening properties').innerText(), /window/);
    const windowRect = dialog.getByRole('button', { name: 'Inspect window window' }).locator('rect');
    const insideX = Number(await windowRect.getAttribute('x'));
    await dialog.getByRole('button', { name: 'Exterior', exact: true }).click();
    assert.ok(Number(await windowRect.getAttribute('x')) < insideX, 'Exterior mirrors the off-center window');
    const svg = dialog.locator('.wall-elevation');
    const drawing = svg.locator(':scope > g');
    const initial = await drawing.getAttribute('transform');
    await dialog.getByRole('button', { name: 'Zoom in on wall', exact: true }).click();
    assert.notEqual(await drawing.getAttribute('transform'), initial);
    await svg.focus(); await page.keyboard.press('ArrowRight');
    assert.match(await drawing.getAttribute('transform'), /470/);
    await dialog.getByRole('button', { name: 'Fit wall to view' }).click();
    assert.equal(await drawing.getAttribute('transform'), initial);
    const bounds = await svg.boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2 + 20, { steps: 4 }); await page.mouse.up();
    assert.notEqual(await drawing.getAttribute('transform'), initial);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(100);
    assert.match(await dialog.locator('.wall-coordinate-readout').innerText(), /U/);
    await dialog.getByRole('button', { name: '3D preview', exact: true }).click();
    await dialog.getByLabel('Exterior isolated wall preview').waitFor();
    assert.equal(await dialog.locator('.wall-webgl-error').count(), 0);
    await dialog.getByRole('button', { name: 'Pan wall', exact: true }).click();
    const canvas = await dialog.locator('canvas').boundingBox();
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.mouse.down(); await page.mouse.move(canvas.x + canvas.width / 2 + 40, canvas.y + canvas.height / 2 + 30, { steps: 4 }); await page.mouse.up();
    await dialog.getByRole('button', { name: 'Zoom in on wall' }).click();
    await dialog.getByRole('button', { name: 'Fit wall to view' }).click();
    await dialog.getByRole('button', { name: '2D elevation', exact: true }).click();
    for (const id of ['north', 'east', 'south', 'west']) {
      await dialog.getByRole('combobox', { name: 'Selected wall', exact: true }).selectOption(id);
      assert.match(await dialog.locator('.wall-properties').first().innerText(), new RegExp(id));
    }
    await dialog.getByLabel("Wall's room").selectOption('custom-room');
    for (const id of outline.map(point => point.wallId)) {
      await dialog.getByRole('combobox', { name: 'Selected wall', exact: true }).selectOption(id);
      assert.match(await dialog.locator('.wall-properties').first().innerText(), new RegExp(id));
    }
    await dialog.getByLabel('Wall measurement units').selectOption('cm');
    assert.match(await dialog.locator('.wall-properties').first().innerText(), /300 cm/);
    if (process.env.WALL_TEST_SCREENSHOT) await page.screenshot({ path: process.env.WALL_TEST_SCREENSHOT });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, 'Mobile dialog has no horizontal overflow');
    await dialog.getByRole('button', { name: 'Return to room' }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await originalCanvas.getAttribute('data-retained'), 'original');
    assert.equal(await page.getByRole('heading', { name: 'Test room', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('room-paint-studio.projects.v1'))[0].version === 2);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('room-paint-studio.projects.v1'))[0]);
    assert.deepEqual(saved.rooms, project.rooms, 'Workspace navigation leaves all room data unchanged');
    assert.deepEqual(errors, []);
    console.log('PASS: wall selection, both surfaces, openings, coordinates, zoom/pan, 3D, units, mobile, return and unchanged project data');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
