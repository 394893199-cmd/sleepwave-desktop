/*
 * main.js - SleepWave 睡眠声波生成器桌面应用主进程（Electron）
 *
 * 职责：
 *   1. 创建应用主窗口并加载本地静态页面（index.html + css + js）
 *   2. 放行地理位置权限（页面通过 navigator.geolocation 获取经纬度，
 *      用于请求 Open-Meteo 当地温度）
 *   3. 外链（GitHub 等）交给系统默认浏览器打开
 *   4. 支持 --smoke-test 冒烟测试模式：加载页面后执行 DOM/脚本检查并退出，
 *      用于打包后的自动化验证
 */
'use strict';

const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');

const isSmokeTest = process.argv.includes('--smoke-test');

function configurePermissions() {
  // 仅放行地理位置，其余权限（摄像头/麦克风/通知/剪贴板等）一律拒绝
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'geolocation');
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1020,
    height: 820,
    minWidth: 720,
    minHeight: 640,
    title: 'SleepWave 睡眠声波生成器',
    backgroundColor: '#101a2e',
    autoHideMenuBar: true,
    show: !isSmokeTest,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return win;
}

async function runSmokeTest(win) {
  const results = { dom: false, scripts: false, audio: false, errors: [] };
  const webContents = win.webContents;

  webContents.on('console-message', (event, level, message) => {
    if (level >= 2) results.errors.push(message);
  });
  webContents.on('render-process-gone', () => {
    results.errors.push('render-process-gone');
  });

  try {
    const start = Date.now();
    let ready = false;
    while (Date.now() - start < 30000) {
      try {
        const state = await webContents.executeJavaScript('document.readyState');
        if (state === 'complete' || state === 'interactive') { ready = true; break; }
      } catch (e) { /* 页面尚未就绪，继续轮询 */ }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!ready) throw new Error('page not ready (timeout)');

    results.dom = await webContents.executeJavaScript(
      "!!(document.getElementById('timeInput') && document.getElementById('locationInput') && " +
      "document.getElementById('currentTempInput') && document.getElementById('indoorTempInput') && " +
      "document.getElementById('genderSelect') && document.getElementById('ageInput') && " +
      "document.getElementById('heightInput') && document.getElementById('weightInput') && " +
      "document.getElementById('generateBtn') && document.getElementById('playBtn') && " +
      "document.getElementById('stopBtn') && document.getElementById('ssiValue'))"
    );
    results.scripts = await webContents.executeJavaScript(
      "!!(window.SleepWaveAlgo && window.SleepWaveWeather && window.SleepWaveAudio)"
    );
    results.audio = await webContents.executeJavaScript(
      "!!(window.AudioContext || window.webkitAudioContext)"
    );
  } catch (e) {
    results.errors.push(String((e && e.message) || e));
  }

  console.log('SMOKE_RESULT ' + JSON.stringify(results));
  app.exit(results.dom && results.scripts && results.audio && results.errors.length === 0 ? 0 : 1);
}

app.whenReady().then(() => {
  configurePermissions();
  const win = createWindow();
  if (isSmokeTest) {
    runSmokeTest(win);
    return;
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});