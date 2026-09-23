/* ============================================================
 * SleepWave weather.js
 * Open-Meteo 免密钥 API：地理反查 / 当前温度获取
 * ============================================================ */
(function (global) {
  'use strict';

  var GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
  var WX_API = 'https://api.open-meteo.com/v1/forecast';

  /* 根据城市名搜索坐标 */
  function searchCity(name) {
    var url = GEO_API + '?name=' + encodeURIComponent(name) + '&count=1&language=zh&format=json';
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.results && j.results.length > 0) {
        var it = j.results[0];
        return { lat: it.latitude, lon: it.longitude, name: it.name + (it.admin1 ? ', ' + it.admin1 : '') };
      }
      return null;
    });
  }

  /* 当前温度（摄氏度） */
  function fetchTemperature(lat, lon) {
    var url = WX_API + '?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m&timezone=auto';
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.current && typeof j.current.temperature_2m === 'number') {
        return { temp: j.current.temperature_2m, units: (j.current_units || {}).temperature_2m || '°C' };
      }
      throw new Error('weather: no temperature field');
    });
  }

  /* 浏览器定位（Promise 风格） */
  function locate() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('geolocation 不可用')); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        function (err) { reject(new Error('定位失败: ' + err.message)); },
        { timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  var api = { searchCity: searchCity, fetchTemperature: fetchTemperature, locate: locate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SleepWaveWeather = api;
})(typeof window !== 'undefined' ? window : global);