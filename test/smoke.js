const algo = require('../js/algorithm.js');
function show(name, input) {
  const p = algo.generateParams(input);
  console.log('=== ' + name + ' ===');
  console.log('SSI=' + p.ssi + ' band=' + p.band + ' f_beat=' + p.fBeat + 'Hz');
  console.log('binaural L' + p.binaural.fL + '/R' + p.binaural.fR + ' | pulse=' + p.pulseRate + 'Hz slowEnv=' + p.slowEnv);
  console.log('carrier fc=' + p.carrier.fc + 'Hz @' + p.carrier.gainDb + 'dB (AM ' + p.carrier.amFreq + 'Hz, depth 0.6)');
  console.log('low=' + p.low.freqs.join('+') + 'Hz @' + p.low.gainDb + 'dB | sub=' + (p.sub.freqs||[]).join('+') + 'Hz @' + p.sub.gainDb + 'dB');
  console.log('noise=' + Math.round(p.noise.pinkRatio*100) + '/' + Math.round(p.noise.brownRatio*100));
  console.log('gain=' + p.gain + ' peakLim=' + p.peakLimit + ' dur=' + p.durationMin + 'min | bmi=' + p.bmi + ' feel=' + p.feelTemp + 'C | hf=' + p.hp.hf);
  console.log('hints=' + JSON.stringify(p.hints));
  console.log('');
}
show('A 女25 165/55 23:00 室内22 室外18',
  { time:'23:00', indoorTemp:22, outdoorTemp:18, gender:'female', age:25, height:165, weight:55, deepSleep:false });
show('B 男50 175/85 23:00 室内28 室外20',
  { time:'23:00', indoorTemp:28, outdoorTemp:20, gender:'male', age:50, height:175, weight:85, deepSleep:false });
show('C 女68 158/60 13:00 室内21 室外25',
  { time:'13:00', indoorTemp:21, outdoorTemp:25, gender:'female', age:68, height:158, weight:60, deepSleep:false });
show('D 边界 90岁/120cm/200kg/40C',
  { time:'03:00', indoorTemp:40, outdoorTemp:40, gender:'male', age:90, height:120, weight:200, deepSleep:true });

// 断言核对（v1.1 期望）
let bad = 0;
function expect(cond, msg) { if (!cond) { bad++; console.log('FAIL: ' + msg); } else console.log('ok: ' + msg); }
const A = algo.generateParams({ time:'23:00', indoorTemp:22, outdoorTemp:18, gender:'female', age:25, height:165, weight:55, deepSleep:false });
const B = algo.generateParams({ time:'23:00', indoorTemp:28, outdoorTemp:20, gender:'male', age:50, height:175, weight:85, deepSleep:false });
const C = algo.generateParams({ time:'13:00', indoorTemp:21, outdoorTemp:25, gender:'female', age:68, height:158, weight:60, deepSleep:false });
const D = algo.generateParams({ time:'03:00', indoorTemp:40, outdoorTemp:40, gender:'male', age:90, height:120, weight:200, deepSleep:true });
expect(A.ssi >= 75, 'A SSI>=75');
expect(A.band === 'delta' && A.fBeat < 3, 'A delta 档');
expect(A.binaural.fL === 160, 'A 双耳载波160');
expect(A.carrier.fc >= 14500 && A.carrier.fc <= 18500, 'A 载波在不可听区');
expect(parseFloat(A.carrier.gainDb) <= -52, 'A 载波增益≤-52dB');
expect(A.sub && A.sub.freqs.length === 2, 'A 次声层存在');
expect(A.durationMin === 90, 'A 时长90min');
expect(B.band === 'theta', 'B theta 档');
expect(B.carrier.fc === 14500, 'B 载波clamp 14.5k');
expect(B.noise.brownRatio === 0.30, 'B 体感28.6C>24暖档棕噪30%（透气分支）');
expect(A.noise.brownRatio === 0.45, 'A 常态棕噪45%增重');
expect(parseFloat(B.carrier.gainDb) <= -52, 'B 载波增益≤-52dB');
expect(C.durationMin === 30, 'C 午睡30min');
expect(D.carrier.fc === 14500, 'D 载波下限14.5k clamp');
// 边界全有限性
const ages=[6,90], heights=[120,220], weights=[30,200];
for (const a of ages) for (const h of heights) for (const w of weights) {
  const p = algo.generateParams({ time:'23:00', indoorTemp:22, outdoorTemp:20, gender:'male', age:a, height:h, weight:w, deepSleep:false });
  const vals = [p.ssi,p.fBeat,p.carrier.fc,p.gain,p.pulseRate,p.binaural.fL,p.binaural.fR,...p.low.freqs,...(p.sub.freqs),p.hp.fUpper];
  if (vals.some(v => !isFinite(v))) { bad++; console.log('NAN age='+a+' h='+h+' w='+w); }
}
console.log(bad===0 ? 'ALL ASSERTIONS PASS' : (bad + ' FAILURES'));
process.exit(bad===0?0:1);
