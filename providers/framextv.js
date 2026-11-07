// frameXTV provider for Nuvio. Promise-based on purpose (no async/await).
// Returns ONE "Auto" stream: the best working source out of everything frameXTV offers.
var API = 'https://api.framextv.cc/api/stream';
var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Origin': 'https://framextv.cc',
  'Referer': 'https://framextv.cc/',
  'Accept': 'application/json'
};
var MAX_ALTERNATES = 3;   // extra frameXTV providers to query
// No network verification: a hung fetch inside Nuvio's plugin runtime left the stream list on "Finding streams...".
var SHOW_ALL = false;     // true = also list every source after the Auto pick
var DEBUG = true;
function log() { if (DEBUG) console.log.apply(console, ['[frameXTV]'].concat([].slice.call(arguments))); }



function call(base, provider) {
  var url = base + (provider ? '&provider=' + encodeURIComponent(provider) : '');
  log('GET', url);
  return fetch(url, { headers: HEADERS })
    .then(function (r) { log('HTTP', r.status, provider || 'default'); return r.json(); })
    .catch(function (e) { log('ERROR', provider || 'default', String(e && e.message || e)); return null; });
}

// Flatten API responses into candidate objects.
function toCandidates(data) {
  if (!data || !data.success || !data.sources) return [];
  var subs = (data.subtitles || []).map(function (s) {
    return { url: s.url, label: s.label || s.language, lang: s.lang };
  });
  return data.sources
    .filter(function (s) { return s && s.url; })
    .map(function (s) {
      return { url: s.url, quality: s.quality || 'Auto', server: s.server || data.provider || 'frameXTV',
               provider: data.provider || '?', type: s.type || 'hls', subs: subs };
    });
}

function height(c) {
  var m = /(\d{3,4})\s*p/i.exec(c.quality);
  return m ? parseInt(m[1], 10) : 720; // "Auto" = unknown, assume 720
}

function score(c) {
  var text = c.server + ' ' + c.quality;
  var s = height(c);
  if (/english/i.test(text)) s += 500;
  if (/hindi|dubbed|\bdub\b/i.test(decodeURIComponent(c.url.replace(/%(?![0-9a-f]{2})/gi, '%25')) + ' ' + text)) s -= 2000;
  if (c.type !== 'hls') s -= 100;
  if (c.subs.length) s += 50;
  if (/\bVPS\b|Server 2/i.test(c.server)) s -= 300; // consistently dead in testing
  return s;
}


function toStream(c, label) {
  return {
    name: label || ('frameXTV - ' + c.server),
    title: c.server + ' - ' + c.quality + (c.subs.length ? ' | ' + c.subs.length + ' subs' : ''),
    description: 'Provider: ' + c.provider + ' | Server: ' + c.server + ' | ' + c.quality + ' | ' + c.type,
    url: c.url,
    quality: c.quality,
    headers: { 'Referer': 'https://framextv.cc/' },
    subtitles: c.subs
  };
}

function getStreams(tmdbId, mediaType, season, episode) {
  log('getStreams', tmdbId, mediaType, season, episode);
  var isTv = mediaType === 'tv';
  var base = API + '?type=' + (isTv ? 'tv' : 'movie') + '&id=' + encodeURIComponent(tmdbId);
  if (isTv) base += '&season=' + (season || 1) + '&episode=' + (episode || 1);

  return call(base).then(function (first) {
    var alts = (first && first.alternates ? first.alternates : []).slice(0, MAX_ALTERNATES);
    return Promise.all(alts.map(function (a) { return call(base, a); })).then(function (rest) {
      var seen = {}, all = [];
      [first].concat(rest).forEach(function (d) {
        toCandidates(d).forEach(function (c) {
          if (!seen[c.url]) { seen[c.url] = 1; all.push(c); }
        });
      });
      all.sort(function (a, b) { return score(b) - score(a); });
      log('candidates', all.length);
      if (!all.length) return [];

      var best = all[0];
      log('best', best.server, best.quality);
      var out = [toStream(best, 'frameXTV - Auto (Best)')];
      if (SHOW_ALL) all.forEach(function (c) { if (c !== best) out.push(toStream(c)); });
      return out;
    });
  }).catch(function (e) { log('FATAL', String(e && e.message || e)); return []; });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
