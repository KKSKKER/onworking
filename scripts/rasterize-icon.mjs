// 用隐藏 Electron 窗口把 SVG 光栅化为 512x512 PNG。
// 用法:npx electron scripts/rasterize-icon.mjs <svgPath> [outPath]
import { app, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

const svgPath = process.argv[2];
const outPath = process.argv[3] ?? path.resolve('build/icon.png');
if (!svgPath) { console.error('usage: electron scripts/rasterize-icon.mjs <svg> [out]'); process.exit(1); }

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512, height: 512, show: false, frame: false,
    webPreferences: { offscreen: true },
  });
  const svg = fs.readFileSync(svgPath, 'utf-8');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0">${svg}</body></html>`;
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  await win.loadURL(dataUrl);
  await new Promise(r => setTimeout(r, 100));
  // Windows 上透明窗口的 capturePage 会在右/下边缘合成灰色条带且颜色偏移
  // (如 #007acc 被渲染成 0,122,205)。改为在页内 canvas 重绘 SVG 并导出
  // RGBA PNG:透明角落 + 精确 #007acc。
  const pngDataUrl = await win.webContents.executeJavaScript(`(async () => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const xml = new XMLSerializer().serializeToString(document.querySelector('svg'));
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('failed to load svg image'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    });
    ctx.drawImage(img, 0, 0, 512, 512);
    return c.toDataURL('image/png');
  })()`);
  const base64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  console.log('icon written to', outPath);
  app.quit();
}).catch(err => { console.error(err); app.exit(1); });
