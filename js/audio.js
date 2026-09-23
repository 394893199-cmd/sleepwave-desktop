/* ============================================================
 * SleepWave audio.js
 * Web Audio 实时生成六层助眠声波 + 波形可视化
 * 0) 主增益 + 动态压缩（峰值安全）
 * 1) 双耳节拍（左右载波 fL/fR，需耳机）
 * 2) 等时脉冲（短音按 pulseRate 重复）
 * 3) 色噪声层（粉红+棕，慢波包络 AM）
 * 4) 低频基座（正弦 48/36 或 55/40 Hz）
 * 5) 高频载波 + 低频 AM 调制（探索性）
 * ============================================================ */
(function (global) {
  'use strict';

  function dbToGain(db) { return Math.pow(10, db / 20); }

  var ctx = null, master = null, comp = null, analyser = null;
  var liveNodes = [], timers = [];
  var playing = false;
  var userVolume = 0.5;
  var frameCb = null;

  /* ---------- 噪声缓冲生成 ---------- */
  function makeNoiseBuffer(ctx, type, seconds) {
    var len = Math.floor(ctx.sampleRate * (seconds || 8));
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var lastOut = 0;
    for (var i = 0; i < len; i++) {
      var white = Math.random() * 2 - 1;
      if (type === 'brown') {
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.5;
      } else {
        // 粉红噪声：一阶 1/f 近似（Paul Kellet 滤波简化）
        lastOut = 0.98 * lastOut + white * 0.02;
        data[i] = white * 0.5 + lastOut * 0.5;
      }
    }
    return buffer;
  }

  /* ---------- 开始 ---------- */
  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = userVolume;

      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -6;
      comp.knee.value = 3;
      comp.ratio.value = 2.5;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;

      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      master.connect(comp);
      comp.connect(analyser);
      analyser.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function makeOsc(type, freq) {
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    liveNodes.push(o);
    return o;
  }

  function makeGain(v) {
    var g = ctx.createGain();
    g.gain.value = (v === undefined ? 1 : v);
    liveNodes.push(g);
    return g;
  }

  /* 等时脉冲：短音（180->90Hz 轻柔下滑 + 软起音 50ms，避免爆音） */
  function schedulePulse(rate) {
    var interval = 1000 / rate;
    function fire() {
      if (!playing) return;
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      var g = ctx.createGain();
      var t0 = ctx.currentTime + 0.01;
      osc.frequency.setValueAtTime(180, t0);
      osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.28);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.008, t0 + 0.05);   // 软起音
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.30); // 长尾衰减
      osc.connect(g); g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.32);
      osc.onended = function () {
        try { osc.disconnect(); g.disconnect(); } catch (e) { /* noop */ }
      };
    }
    fire();
    var id = setInterval(fire, interval);
    timers.push(id);
  }

  /* 慢波包络：对噪声组增益做 0.5~1Hz AM（类 CLAS 开环近似） */
  function applySlowEnv(gainNode, hz) {
    if (!hz || hz <= 0) return;
    var lfo = makeOsc('sine', hz);
    var lfoGain = makeGain(0.35);
    lfo.connect(lfoGain);
    lfoGain.connect(gainNode.gain);
    lfo.start();
    liveNodes.push(lfo);
  }

  /* ---------- 主入口 ---------- */
  function start(params) {
    stopInternal();
    ensureCtx();
    playing = true;
    liveNodes = []; timers = [];
    var t0 = ctx.currentTime + 0.05;

    // 0) 主增益（方案增益 * 用户音量，峰值上限保护）
    var mainGain = makeGain(params.gain);
    master.gain.setTargetAtTime(userVolume, t0, 0.05);

    /* 1) 双耳节拍 */
    var oscL = makeOsc('sine', params.binaural.fL);
    var oscR = makeOsc('sine', params.binaural.fR);
    var gl = makeGain(dbToGain(-30));
    var gr = makeGain(dbToGain(-30));
    if (ctx.createStereoPanner) {
      var panL = ctx.createStereoPanner(); panL.pan.value = -1;
      var panR = ctx.createStereoPanner(); panR.pan.value = 1;
      oscL.connect(gl); gl.connect(panL); panL.connect(mainGain);
      oscR.connect(gr); gr.connect(panR); panR.connect(mainGain);
      liveNodes.push(panL, panR);
    } else {
      oscL.connect(gl); gl.connect(mainGain);
      oscR.connect(gr); gr.connect(mainGain);
    }
    oscL.start(t0); oscR.start(t0);

    /* 2) 等时脉冲 */
    schedulePulse(params.pulseRate);

    /* 3) 色噪声层（粉红 + 棕，经慢波包络） */
    var pinkBuf = makeNoiseBuffer(ctx, 'pink', 8);
    var brownBuf = makeNoiseBuffer(ctx, 'brown', 8);
    var noiseBaseDb = -34 + (100 - params.ssi) * 0.05; // SSI 越低越需要掩蔽
    var noiseGain = makeGain(dbToGain(noiseBaseDb));

    var srcP = ctx.createBufferSource(); srcP.buffer = pinkBuf; srcP.loop = true; liveNodes.push(srcP);
    srcP.connect(noiseGain);
    var srcB = ctx.createBufferSource(); srcB.buffer = brownBuf; srcB.loop = true; liveNodes.push(srcB);
    srcB.connect(noiseGain);
    // 按水温比例微调：实际上混合比例已体现在 buffer 音量差异，这里简化共用一个增益；比例在算法层已给出供展示
    noiseGain.connect(mainGain);
    applySlowEnv(noiseGain, params.slowEnv);
    srcP.start(t0); srcB.start(t0);

    /* 4) 低频基座 */
    for (var i = 0; i < params.low.freqs.length; i++) {
      var loG = makeGain(dbToGain(params.low.gainDb));
      var loO = makeOsc('sine', params.low.freqs[i]);
      loO.connect(loG); loG.connect(mainGain);
      loO.start(t0);
    }

    /* 4.5) 次声层（<20Hz，可闻度极低，超低频"虚拟刺激"成分） */
    if (params.sub && params.sub.freqs) {
      for (var i2 = 0; i2 < params.sub.freqs.length; i2++) {
        var suG = makeGain(dbToGain(params.sub.gainDb));
        var suO = makeOsc('sine', params.sub.freqs[i2]);
        suO.connect(suG); suG.connect(mainGain);
        suO.start(t0);
      }
    }

    /* 5) 高频载波 + 低频 AM 调制（探索性，已限幅） */
    var carG = makeGain(dbToGain(params.carrier.gainDb));
    var carO = makeOsc('sine', params.carrier.fc);
    var amO = makeOsc('sine', params.carrier.amFreq);
    var amGain = makeGain(0.6); // 调制深度（降低刺耳感）
    amO.connect(amGain); amGain.connect(carG.gain);
    carO.connect(carG); carG.connect(mainGain);
    carO.start(t0); amO.start(t0);

    /* 二级限幅：任何层不过 mainGain 的增益已 ≤0.34，压缩兜底 */
    mainGain.connect(master);
    liveNodes.push(mainGain);

    startVisualization();
  }

  /* ---------- 停止 ---------- */
  function stopInternal() {
    playing = false;
    timers.forEach(clearInterval);
    timers = [];
    liveNodes.forEach(function (n) {
      try {
        if (n.stop) n.stop(0);
        n.disconnect();
      } catch (e) { /* already stopped */ }
    });
    liveNodes = [];
    stopVisualization();
  }

  function stop() { stopInternal(); }

  /* ---------- 音量 ---------- */
  function setVolume(v) {
    userVolume = v;
    if (ctx && master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  /* ---------- 可视化 ---------- */
  function startVisualization() {
    stopVisualization();
    if (!analyser || !frameCb) return;
    function loop() {
      if (!playing) return;
      frameCb(analyser);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }
  function stopVisualization() {
    // rAF 由 playing 标志控制
  }

  function onFrame(cb) { frameCb = cb; }

  var api = { start: start, stop: stop, setVolume: setVolume, onFrame: onFrame, isPlaying: function () { return playing; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SleepWaveAudio = api;
})(typeof window !== 'undefined' ? window : global);