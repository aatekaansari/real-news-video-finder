// ============================================================
// फाइल 2/3 : api/yt.js — Vercel Serverless (FULL FIXED)
// ============================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { handle, videoId } = req.query;

  const FALLBACK_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const HDRS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.youtube.com/'
  };

  function cleanText(s) {
    return (s || '')
      .replace(/\\u([\da-f]{4})/gi, (_, g) => String.fromCharCode(parseInt(g, 16)))
      .replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\n/g, '\n')
      .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  }

  async function fetchText(url) {
    try { const r = await fetch(url, { headers: HDRS }); if (!r.ok) return null; return await r.text(); }
    catch { return null; }
  }

  async function innertubePlayer(apiKey, vId, clientName) {
    const client = clientName === 'ANDROID'
      ? { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'hi' }
      : { clientName: 'WEB', clientVersion: '2.20260901.00.00', hl: 'hi', gl: 'IN' };
    try {
      const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ context: { client }, videoId: vId })
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  async function fetchTranscript(tracks) {
    const sub = tracks.find(t => t.languageCode === 'hi') || tracks.find(t => t.languageCode === 'en') || tracks[0];
    if (!sub || !sub.baseUrl) return '';
    const xml = await fetchText(sub.baseUrl);
    if (!xml) return '';
    return xml.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  }

  function parseVideosHtml(html) {
    const items = [], seen = {};
    const chunks = html.split('"videoRenderer":{');
    for (let i = 1; i < chunks.length && items.length < 8; i++) {
      const c = chunks[i];
      const vid = (c.match(/"videoId":"([\w-]{11})"/) || [])[1];
      const title = (c.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/) || [])[1];
      const pub = (c.match(/"publishedTimeText":\{"simpleText":"((?:[^"\\]|\\.)*)"/) || [])[1];
      if (vid && title && !seen[vid]) { seen[vid] = 1; items.push({ videoId: vid, title: cleanText(title), published: pub ? cleanText(pub) : 'हाल ही में' }); }
    }
    return items;
  }

  // ---------- VIDEO: tags + desc + full transcript ----------
  if (videoId) {
    let tags = [], desc = '', transcript = '', tracks = [];
    let apiKey = FALLBACK_KEY;

    const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`);
    if (html) {
      const km = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/); if (km) apiKey = km[1];
      const pm = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (pm) {
        try {
          const d = JSON.parse(pm[1]);
          tags = (d.videoDetails && d.videoDetails.keywords) || [];
          desc = (d.videoDetails && d.videoDetails.shortDescription) || '';
          tracks = (((d.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [];
        } catch {}
      }
      if (!tags.length) {
        const k = html.match(/"keywords":\[(.*?)\]/s);
        if (k) tags = [...k[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => cleanText(m[1]));
      }
      if (!desc) { const d = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/s); if (d) desc = cleanText(d[1]); }
    }

    if (!desc || !tracks.length) {
      const p = await innertubePlayer(apiKey, videoId, 'WEB');
      if (p) {
        tags = (p.videoDetails && p.videoDetails.keywords) || tags;
        desc = (p.videoDetails && p.videoDetails.shortDescription) || desc;
        tracks = (((p.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || tracks;
      }
    }
    if (!tracks.length || !desc) {
      const p2 = await innertubePlayer(apiKey, videoId, 'ANDROID');
      if (p2) {
        tags = (p2.videoDetails && p2.videoDetails.keywords) || tags;
        desc = (p2.videoDetails && p2.videoDetails.shortDescription) || desc;
        tracks = (((p2.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || tracks;
      }
    }

    if (tracks.length) transcript = await fetchTranscript(tracks);
    return res.status(200).json({ status: 'ok', tags, desc, transcript });
  }

  // ---------- CHANNEL videos ----------
  if (!handle) return res.status(400).json({ error: 'Missing handle' });
  const clean = String(handle).replace(/^@/, '').trim();

  for (const u of [`https://www.youtube.com/@${clean}/videos`, `https://www.youtube.com/@${clean}`]) {
    const html = await fetchText(u);
    if (!html) continue;
    const items = parseVideosHtml(html);
    if (!items.length) continue;
    const nm = html.match(/"channelMetadataRenderer":\{"title":"((?:[^"\\]|\\.)*)"/) || html.match(/<meta property="og:title" content="([^"]+)"/);
    return res.status(200).json({ status: 'ok', channelName: nm ? cleanText(nm[1]) : clean, items });
  }

  return res.status(500).json({ error: 'Channel load failed' });
}
