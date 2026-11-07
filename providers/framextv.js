// frameXTV provider for Nuvio. Promise-based on purpose (no async/await).
var API = 'https://api.framextv.cc/api/stream';
var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Origin': 'https://framextv.cc',
  'Referer': 'https://framextv.cc/',
  'Accept': 'application/json'
};
var MAX_ALTERNATES = 2;
var DEBUG = true;
function log() { if (DEBUG) console.log.apply(console, ['[frameXTV]'].concat([].slice.call(arguments))); }

function call(base, provider) {
  var url = base + (provider ? '&provider=' + encodeURIComponent(provider) : '');
  log('GET', url);
  return fetch(url, { headers: HEADERS })
    .then(function (r) { log('HTTP', r.status, provider || 'default'); return r.json(); })
    .catch(function (e) { log('ERROR', provider || 'default', String(e && e.message || e)); return null; });
}

function toStreams(data, mediaType) {
  if (!data || !data.success || !data.sources) return [];
  var subs = (data.subtitles || []).map(function (s) {
    return { url: s.url, label: s.label || s.language, lang: s.lang };
  });
  return data.sources
    .filter(function (s) { return s && s.url; })
    .map(function (s) {
      return {
        name: 'frameXTV - ' + (s.server || data.provider || 'stream'),
        title: (s.server || data.provider || 'frameXTV') + (s.quality ? ' - ' + s.quality : '') + (subs.length ? ' | ' + subs.length + ' subs' : ''),
        description: 'Provider: ' + (data.provider || '?') + ' | Server: ' + (s.server || '?') + ' | ' + (s.quality || 'Auto') + ' | ' + (s.type || 'hls'),
        url: s.url,
        quality: s.quality || 'Auto',
        headers: { 'Referer': 'https://framextv.cc/' },
        subtitles: subs
      };
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
  log('getStreams', tmdbId, mediaType, season, episode);
  var isTv = mediaType === 'tv';
  var base = API + '?type=' + (isTv ? 'tv' : 'movie') + '&id=' + encodeURIComponent(tmdbId);
  if (isTv) base += '&season=' + (season || 1) + '&episode=' + (episode || 1);

  return call(base).then(function (first) {
    var alts = (first && first.alternates ? first.alternates : []).slice(0, MAX_ALTERNATES);
    return Promise.all(alts.map(function (a) { return call(base, a); })).then(function (rest) {
      var seen = {}, out = [];
      [first].concat(rest).forEach(function (d) {
        toStreams(d, mediaType).forEach(function (s) {
          if (!seen[s.url]) { seen[s.url] = 1; out.push(s); }
        });
      });
      log('returning', out.length, 'streams');
      return out;
    });
  }).catch(function (e) { log('FATAL', String(e && e.message || e)); return []; });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
