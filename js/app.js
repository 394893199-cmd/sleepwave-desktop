/* ============================================================
 * SleepWave app.js
 * UI 绑定：表单读取 -> algorithm 生成 -> 渲染 -> 音频控制
 * ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var currentParams = null;

  /* ---------- 默认值：时间置为当前时间 ---------- */
  function setDefaultTime() {
    var d = new Date();
    var hh = ('0' + d.getHours()).slice(-2);
    var mm = ('0' + d.getMinutes()).slice(-2);
    $('timeInput').value = hh + ':' + mm;
  }

  /* ---------- 表单读取 ---------- */
  function readInputs() {
    return {
      time: $('timeInput').value || '23:00',
      location: $('locationInput').value.trim(),
      outdoorTemp: parseFloat($('currentTempInput').value) || 20,
      indoorTemp: parseFloat($('indoorTempInput').value) || 22,
      gender: $('genderSelect').value,
      age: parseInt($('ageInput').value, 10) || 30,
      height: parseFloat($('heightInput').value) || 170,
      weight: parseFloat($('weightInput').value) || 65,
      deepSleep: $('deepSleepToggle').checked
    };
  }

  /* ---------- 渲染结果 ---------- */
  function render(input, p) {
    currentParams = p;
    $('ssiValue').textContent = p.ssi;
    $('ssiBar').style.width = (p.ssi * 0.86) + '%';

    var bandName = { delta: 'δ 深睡引导', theta: 'θ 入睡过渡', alpha: 'α/θ 放松' }[p.band];
    $('pBand').textContent = bandName;
    $('pBeat').textContent = p.fBeat + ' Hz';
    $('pBinaural').textContent = 'L ' + p.binaural.fL + ' Hz / R ' + p.binaural.fR + ' Hz（差频 ' + p.fBeat + ' Hz，需耳机）';
    $('pPulse').textContent = p.pulseRate + ' 次/秒' + (p.slowEnv > 0 ? '，慢波包络 ' + p.slowEnv + ' Hz（类CLAS）' : '');
    $('pNoise').textContent = '粉红 ' + Math.round(p.noise.pinkRatio * 100) + '% / 棕 ' + Math.round(p.noise.brownRatio * 100) + '%';
    $('pLow').textContent = p.low.freqs.join(' + ') + ' Hz @ ' + p.low.gainDb + ' dB';
    $('pCarrier').textContent = p.carrier.fc + ' Hz @ ' + p.carrier.gainDb + ' dB（AM ' + p.carrier.amFreq + ' Hz 调制）';
    $('pDuration').textContent = p.durationMin + ' 分钟（90 分钟睡眠周期倍数）';

    var ul = $('hintList');
    ul.innerHTML = '';
    p.hints.forEach(function (h) {
      var li = document.createElement('li');
      li.textContent = h;
      ul.appendChild(li);
    });
    if (p.hints.length === 0) {
      var li0 = document.createElement('li');
      li0.textContent = '环境与节律条件良好，无风险提示';
      ul.appendChild(li0);
    }

    $('playBtn').disabled = false;
    $('statusText').textContent = '方案已生成：' + bandName + '，适宜度 ' + p.ssi + '，体感温度约 ' + p.feelTemp + '℃';
    $('statusText').className = 'status ok';
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    setDefaultTime();

    // 定位获取气温：优先城市名，其次浏览器定位
    $('locateBtn').addEventListener('click', function () {
      var status = $('statusText');
      status.textContent = '正在获取气温...';
      status.className = 'status';
      var name = $('locationInput').value.trim();

      function apply(lat, lon, placeName) {
        SleepWaveWeather.fetchTemperature(lat, lon).then(function (w) {
          $('currentTempInput').value = w.temp;
          if (placeName) $('locationInput').value = placeName;
          status.textContent = '已获取 ' + (placeName || (lat.toFixed(2) + ',' + lon.toFixed(2))) + ' 当前温度 ' + w.temp + '℃';
          status.className = 'status ok';
        }).catch(function (e) {
          status.textContent = '温度获取失败：' + e.message;
          status.className = 'status err';
        });
      }

      if (name) {
        SleepWaveWeather.searchCity(name).then(function (r) {
          if (r) apply(r.lat, r.lon, r.name);
          else { status.textContent = '未找到该地点，请检查名称'; status.className = 'status err'; }
        }).catch(function () {
          status.textContent = '地点解析失败'; status.className = 'status err';
        });
      } else {
        SleepWaveWeather.locate().then(function (pos) {
          $('locationInput').value = pos.lat.toFixed(3) + ', ' + pos.lon.toFixed(3);
          apply(pos.lat, pos.lon, null);
        }).catch(function (e) {
          status.textContent = e.message + '，可手动输入城市名重试';
          status.className = 'status err';
        });
      }
    });

    // 生成
    $('generateBtn').addEventListener('click', function () {
      var input = readInputs();
      var p = SleepWaveAlgo.generateParams(input);
      render(input, p);
    });

    // 播放 / 停止
    $('playBtn').addEventListener('click', function () {
      if (!currentParams) return;
      SleepWaveAudio.start(currentParams);
      $('playBtn').disabled = true;
      $('stopBtn').disabled = false;
    });
    $('stopBtn').addEventListener('click', function () {
      SleepWaveAudio.stop();
      $('stopBtn').disabled = true;
      $('playBtn').disabled = false;
    });

    // 音量
    $('volumeSlider').addEventListener('input', function () {
      var v = parseInt(this.value, 10) / 100;
      $('volValue').textContent = this.value + '%';
      SleepWaveAudio.setVolume(v);
    });

    // 波形
    var canvas = $('wave');
    var ctx2 = canvas.getContext('2d');
    SleepWaveAudio.onFrame(function (analyser) {
      var w = canvas.width, h = canvas.height;
      var data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      ctx2.clearRect(0, 0, w, h);
      ctx2.strokeStyle = '#6fa8ff';
      ctx2.lineWidth = 1.6;
      ctx2.beginPath();
      var slice = data.length / w;
      for (var x = 0; x < w; x++) {
        var v = data[Math.floor(x * slice)] / 128.0;
        var y = v * h / 2;
        if (x === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
      }
      ctx2.stroke();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();