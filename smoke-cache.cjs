const { app, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = os.tmpdir();
const SMOKE_USER = path.join(TMP, 'onworking-smoke-user');
const SMOKE_SESSION = path.join(TMP, 'onworking-smoke-session');
const LOG = path.join(TMP, 'onworking-smoke.log');
try { fs.rmSync(LOG, { force: true }); } catch {}
function log(msg) { fs.appendFileSync(LOG, msg + '\n'); }

const DIRS = ['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'blob_storage'];
function clean() {
  for (const d of DIRS) { try { fs.rmSync(path.join(SMOKE_USER, d), { recursive: true, force: true }); } catch (e) { log('[smoke] rm fail ' + d + ': ' + e.message); } }
}

// 模拟上次运行的残留（与真实顺序一致：先清残留，再 setPath 重定向）
fs.mkdirSync(SMOKE_SESSION + '/Local Storage/leveldb', { recursive: true });
fs.writeFileSync(SMOKE_SESSION + '/Local Storage/leveldb/000003.log', 'stale-data');
log('[smoke] simulating leftover from previous run: ' + fs.existsSync(SMOKE_SESSION));
try {
  fs.rmSync(SMOKE_SESSION, { recursive: true, force: true });
  log('[smoke] startup cleanup of leftover session dir: OK');
} catch (e) {
  log('[smoke] startup cleanup FAILED: ' + e.code + ' ' + e.message);
}
app.setPath('userData', SMOKE_USER);
app.setPath('sessionData', SMOKE_SESSION);

app.whenReady().then(async () => {
  clean();
  // 写一个 Cookie：验证它会落到 sessionData(临时目录) 而非 userData
  await session.defaultSession.cookies.set({ url: 'https://smoke.test', name: 'a', value: '1' });
  await new Promise(r => setTimeout(r, 800));
  log('[smoke] sessionData ' + SMOKE_SESSION + ' exists = ' + fs.existsSync(SMOKE_SESSION));
  if (fs.existsSync(SMOKE_SESSION)) log('[smoke]   contents: ' + fs.readdirSync(SMOKE_SESSION).join(', '));
  for (const d of DIRS) if (fs.existsSync(path.join(SMOKE_USER, d))) log('[smoke] userData/' + d + ' => created (will be cleaned on quit)');
  app.quit();
});

app.on('will-quit', () => {
  clean();
  // 诊断：看 sessionData 删除具体失败原因
  try {
    fs.rmSync(SMOKE_SESSION, { recursive: true, force: true });
    log('[smoke] session rm OK');
  } catch (e) {
    log('[smoke] session rm fail: code=' + e.code + ' msg=' + e.message);
  }
  log('[smoke] --- after will-quit ---');
  log('[smoke] sessionData exists = ' + fs.existsSync(SMOKE_SESSION));
  for (const d of DIRS) log('[smoke] userData/' + d + ' exists = ' + fs.existsSync(path.join(SMOKE_USER, d)));
  try { fs.rmSync(SMOKE_USER, { recursive: true, force: true }); } catch {}
});
