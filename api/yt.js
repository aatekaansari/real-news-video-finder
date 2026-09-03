// api/yt.js — Real Transcript + Channel Video Extractor (FIXED)
// YouTube RSS server IPs par 404 deta hai, isliye primary method = HTML scraping

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { handle, videoId } = req.query;

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
    'Accept-Language': 'hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.youtube.com/'
  };

  const cleanText = (s) =>
    (s || '')
      .replace(/\\u([\da-f]{4})/gi, (_, g) => String.fromCharCode(parseInt(g, 16)))
      .replace(/\\x([\da-f]{2})/gi, (_, g) => String.fromCharCode(parseInt(g, 16)))
      .replace(/\\u0026/gi, '&')
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

  // ---------- Channel ke videos (HTML se) ----------
  function parseVideos(html) {
    const items = [];
    const seen = {};
    const chunks = html.split('"videoRenderer":{');
    for (let i = 1; i < chunks.length && items.length < 8; i++) {
      const chunk = chunks[i];
      const vid = (chunk.match(/"videoId":"([\w-]{11})"/) || [])[1];
      const title = (chunk.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/) || [])[1];
      const pub = (chunk.match(/"publishedTimeText":\{"simpleText":"((?:[^"\\]|\\.)*)"/) || [])[1];
      if (vid && title && !seen[vid]) {
        seen[vid] = 1;
        items.push({ videoId: vid, title: cleanText(title), published: pub ? cleanText(pub) : 'हाल ही में' });
      }
    }
    return items;
  }

  // ---------- 1) Video Meta + REAL Spoken Transcript ----------
  if (videoId) {
    let tags = [], desc = '', transcript = '';
    try {
      const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: HEADERS });
      const html = await ytRes.text();

      const jsonMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          tags = data.videoDetails?.keywords || [];
          desc = data.videoDetails?.shortDescription || '';
          const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
          const subTrack = tracks.find(t => t.languageCode === 'hi') || tracks.find(t => t.languageCode === 'en') || tracks[0];
          if (subTrack && subTrack.baseUrl) {
            const subRes = await fetch(subTrack.baseUrl, { headers: HEADERS });
            if (subRes.ok) {
              const xmlText = await subRes.text();
              transcript = xmlText.replace(/<text[^>]*>/gi, ' ').replace(/<\/text>/gi, ' ')
                .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
            }
          }
        } catch (e) {}
      }

      // Fallback regex (agar JSON parse fail ho)
      if (!tags.length) {
        const km = html.match(/"keywords":\[(.*?)\]/s);
        if (km) tags = [...km[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => cleanText(m[1]));
      }
      if (!desc) {
        const dm = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/s);
        if (dm) desc = cleanText(dm[1]);
      }
      if (!transcript) {
        const cm = html.match(/"baseUrl":"((?:[^"\\]|\\.)*timedtext(?:[^"\\]|\\.)*)"/s);
        if (cm) {
          const subRes = await fetch(cleanText(cm[1]), { headers: HEADERS });
          if (subRes.ok) {
            transcript = (await subRes.text()).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
          }
        }
      }
      return res.status(200).json({ status: 'ok', tags, desc, transcript });
    } catch (e) {
      return res.status(200).json({ status: 'ok', tags, desc, transcript });
    }
  }

  // ---------- 2) Channel Videos (scraping primary, RSS last fallback) ----------
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  const clean = String(handle).replace(/^@/, '').trim();
  const tryUrls = [
    `https://www.youtube.com/@${clean}/videos`,
    `https://www.youtube.com/@${clean}`,
    `https://www.youtube.com/c/${clean}/videos`,
    `https://www.youtube.com/c/${clean}`,
    `https://www.youtube.com/user/${clean}/videos`
  ];

  for (const url of tryUrls) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (!r.ok) continue;
      const html = await r.text();
      const items = parseVideos(html);
      if (!items.length) continue;

      const nameMatch =
        html.match(/"channelMetadataRenderer":\{"title":"((?:[^"\\]|\\.)*)"/) ||
        html.match(/<meta property="og:title" content="([^"]+)"/) ||
        html.match(/"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/);
      const channelName = nameMatch ? cleanText(nameMatch[1]) : clean;

      return res.status(200).json({ status: 'ok', channelName, items });
    } catch (e) { /* agla URL try karo */ }
  }

  return res.status(500).json({ error: 'Channel load failed' });
}
