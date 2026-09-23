/* ============================================================
 * SleepWave algorithm.js
 * 输入参数 -> 声波参数 映射核心（对应 docs/design.md）
 * 零依赖，浏览器 + Node 通用
 * ============================================================ */
(function (global) {
  'use strict';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------- 1.1 睡眠适宜度指数 SSI ---------- */
  function timeToMin(hhmm) {
    if (!hhmm) return 23 * 60; // 默认 23:00
    var p = String(hhmm).split(':').map(Number);
    var min = p[0] * 60 + (p[1] || 0);
    return min;
  }

  function computeSSI(input) {
    var t = timeToMin(input.time);

    // S_time: 理想中心 23:00 (1380min)，跨零点取最小环距
    var dNight = Math.abs(t - 1380);
    dNight = dNight > 720 ? 1440 - dNight : dNight;
    var sTime = clamp(100 - dNight * 1.6, 15, 100);
    // 午睡窗口 12:00-15:00 (720-900，中心 810)
    var dNap = Math.abs(t - 810);
    dNap = dNap > 720 ? 1440 - dNap : dNap;
    sTime = Math.max(sTime, clamp(100 - dNap * 1.2, 15, 100));

    // S_roomTemp: 最佳 18-22 度，中心 20
    var sRoom = clamp(100 - Math.abs(input.indoorTemp - 20) * 12, 0, 100);

    // S_envDiff: 室内外温差
    var diff = Math.abs(input.indoorTemp - input.outdoorTemp);
    var sEnv = clamp(110 - diff * 5, 20, 100);

    // S_bmi
    var bmi = computeBMI(input.height, input.weight);
    var sBmi = clamp(100 - Math.max(0, bmi - 23) * 3.6, 30, 100);

    var ssi = 0.45 * sTime + 0.30 * sRoom + 0.15 * sEnv + 0.10 * sBmi;
    ssi = clamp(ssi, 0, 100);
    return { ssi: +ssi.toFixed(1), sTime: +sTime.toFixed(1), sRoom: +sRoom.toFixed(1), sEnv: +sEnv.toFixed(1), sBmi: +sBmi.toFixed(1), bmi: +bmi.toFixed(1) };
  }

  /* ---------- 1.2 个性化听力系数 HP ---------- */
  function computeHP(age) {
    age = clamp(age, 6, 90);
    var fUpper = clamp(20000 - (age - 10) * 120, 10000, 20000);
    var hf = clamp(1 - Math.max(0, age - 25) * 0.016, 0.45, 1.0);
    var lf = clamp(1 - Math.max(0, age - 40) * 0.006, 0.75, 1.0);
    return { fUpper: Math.round(fUpper), hf: +hf.toFixed(3), lf: +lf.toFixed(3) };
  }

  /* ---------- 1.3 体表面积 BSA (Du Bois) + 体感修正 ---------- */
  function computeBSA(heightCm, weightKg) {
    var bsa = 0.007184 * Math.pow(weightKg, 0.425) * Math.pow(heightCm, 0.725);
    var feelCorr = (bsa - 1.75) * 2.2;
    return { bsa: +bsa.toFixed(3), feelCorr: +feelCorr.toFixed(1) };
  }

  function computeBMI(heightCm, weightKg) {
    var h = heightCm / 100;
    if (h <= 0) return 23;
    return weightKg / (h * h);
  }

  /* ---------- 2 声波参数生成（主入口） ---------- */
  function generateParams(input) {
    var s = computeSSI(input);
    var hp = computeHP(input.age);
    var bsaInfo = computeBSA(input.height, input.weight);
    var feelTemp = input.indoorTemp + bsaInfo.feelCorr;

    // 2.1 目标脑波频段
    var tMin = timeToMin(input.time);
    var dNap = Math.abs(tMin - 810);
    dNap = dNap > 720 ? 1440 - dNap : dNap;
    var isNapWindow = dNap < 60; // 12:00~15:00 午睡窗口
    var fBeat = +(lerp(0.5, 8.0, (100 - s.ssi) / 100)).toFixed(1);
    var band;
    if (s.ssi >= 70) band = 'delta';
    else if (s.ssi >= 45) band = 'theta';
    else band = 'alpha';

    if (input.deepSleep && band !== 'delta') {
      // 深睡优先：强制 delta 档，f_beat 压到 0.5-3Hz
      band = 'delta';
      fBeat = +(Math.max(0.5, Math.min(3.0, fBeat))).toFixed(1);
    } else if (isNapWindow && band !== 'alpha') {
      // 午睡窗口不引导深睡（避免睡眠惯性），改 α/θ 放松档 4~9Hz
      band = (s.ssi >= 45) ? 'theta' : 'alpha';
      fBeat = +(lerp(8.0, 6.0, s.ssi / 100)).toFixed(1);
    }

    // 2.2 双耳节拍（载波低频化，更柔和）
    var fL = input.age > 60 ? 150 : 160;
    var fR = fL + fBeat;

    // 2.3 等时脉冲
    var pulseRate = +(band === 'delta' ? fBeat : fBeat * 1.5).toFixed(1);
    pulseRate = Math.max(pulseRate, 0.5);
    // 深睡档叠加慢波节奏包络（类 CLAS 开环近似）：0.5~1Hz
    var slowEnv = band === 'delta' ? +(Math.max(0.5, Math.min(1.0, fBeat))).toFixed(2) : 0;

    // 2.4 色噪声层（自来水温启发式；棕噪增重 → 更暖更不刺耳）
    var pinkRatio = 0.55, brownRatio = 0.45;
    if (feelTemp < 18) { pinkRatio = 0.40; brownRatio = 0.60; }
    else if (feelTemp > 24) { pinkRatio = 0.70; brownRatio = 0.30; }

    // 2.5 低频基座 + 次声层（<20Hz 人耳几乎不可闻，属"超低频虚拟成分"）
    var lowFreqs = input.gender === 'female' ? [55, 40] : [48, 36];
    var lowGainDb = feelTemp < 18 ? -36 : -38;
    var subFreqs = [14, 16];
    var subGainDb = -42;

    // 2.6 高频载波 + AM 调制：上移至近不可听区（逼近个人听觉上限），增益压至 -50dB 级
    //     普通扬声器 >16kHz 响应快速衰减，实际可闻度极低（"超声模拟"成分）
    var fc = Math.min(hp.fUpper - 800, 18500);
    if (fc < 14500) fc = 14500; // 不回落至可闻刺耳区
    var carrierGainDb = -50 - (1 - hp.hf) * 8;
    if (fc > 12000) carrierGainDb = Math.min(carrierGainDb, -52);

    // 2.7 主增益与时长
    var gain = clamp(0.22 + s.ssi * 0.0012, 0.22, 0.34);
    var durationMin;
    if (isNapWindow) durationMin = 30; // 午睡不宜超过 30 分钟，避免睡眠惯性
    else if (s.ssi >= 70) durationMin = 90;
    else if (s.ssi >= 45) durationMin = 60;
    else durationMin = 30;

    // 提示信息
    var hints = [];
    if (s.bmi >= 28) hints.push('BMI ' + s.bmi + '（≥28）：与睡眠呼吸暂停风险相关，建议就医评估');
    else if (s.bmi >= 25) hints.push('BMI ' + s.bmi + '（≥25）：超重边缘，注意体重管理');
    if (s.bmi < 18.5) hints.push('BMI ' + s.bmi + '（<18.5）：偏瘦，注意保暖');
    if (input.indoorTemp < 18) hints.push('室内温度偏低，建议调至 18–22℃ 睡眠最优区间');
    if (input.indoorTemp > 22) hints.push('室内温度偏高，建议调至 18–22℃ 睡眠最优区间');
    if (Math.abs(input.indoorTemp - input.outdoorTemp) > 8) hints.push('室内外温差较大（>8℃），环境波动可能增加觉醒');
    if (input.age >= 50) hints.push('年龄相关高频听力下降：载波已置于近不可听区（' + fc + ' Hz），能量极低');
    if (fc >= 17000) hints.push('高频载波处于近不可听区（' + fc + ' Hz），已按听力保护上限强制衰减');
    if (band === 'alpha') hints.push('当前非最佳入睡窗口，已生成 alpha/theta 放松档（适合午休与静息）');

    return {
      ssi: s.ssi, sTime: s.sTime, sRoom: s.sRoom, sEnv: s.sEnv, sBmi: s.sBmi, bmi: s.bmi,
      hp: hp, bsa: bsaInfo.bsa, feelTemp: +feelTemp.toFixed(1),
      band: band, fBeat: fBeat,
      binaural: { fL: fL, fR: fR },
      pulseRate: pulseRate, slowEnv: slowEnv,
      noise: { pinkRatio: pinkRatio, brownRatio: brownRatio },
      low: { freqs: lowFreqs, gainDb: lowGainDb },
      sub: { freqs: subFreqs, gainDb: subGainDb },
      carrier: { fc: fc, gainDb: +carrierGainDb.toFixed(1), amFreq: fBeat },
      gain: Math.round(gain * 1000) / 1000,
      peakLimit: 0.5,
      durationMin: durationMin,
      hints: hints
    };
  }

  /* ---------- 导出 ---------- */
  var api = {
    clamp: clamp, lerp: lerp,
    computeSSI: computeSSI,
    computeHP: computeHP,
    computeBSA: computeBSA,
    computeBMI: computeBMI,
    generateParams: generateParams
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SleepWaveAlgo = api;
})(typeof window !== 'undefined' ? window : global);