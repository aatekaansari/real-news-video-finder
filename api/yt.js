// api/yt.js - Real Transcript Subtitle Extractor
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { handle, videoId } = req.query;

  // 1. Fetch Video Metadata + REAL Spoken Transcript Subtitles
  if (videoId) {
    try {
      const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept-Language': 'hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      const html = await ytRes.text();

      let tags = ["DLS News", "Breaking News", "Latest Updates"];
      let desc = "";
      let transcript = "";

      const jsonMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (jsonMatch && jsonMatch[1]) {
        const data = JSON.parse(jsonMatch[1]);
        if (data.videoDetails?.keywords) tags = data.videoDetails.keywords;
        if (data.videoDetails?.shortDescription) desc = data.videoDetails.shortDescription;

        // --- REAL SUBTITLE / CAPTION EXTRACTOR ---
        const captionTracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        if (captionTracks.length > 0) {
          let subTrack = captionTracks.find(t => t.languageCode === 'hi') || 
                         captionTracks.find(t => t.languageCode === 'en') || 
                         captionTracks[0];

          if (subTrack && subTrack.baseUrl) {
            const subRes = await fetch(subTrack.baseUrl);
            if (subRes.ok) {
              const xmlText = await subRes.text();
              transcript = xmlText
                .replace(/<text[^>]*>/gi, ' ')
                .replace(/<\/text>/gi, ' ')
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, ' ')
                .trim();
            }
          }
        }
      }

      return res.status(200).json({ status: 'ok', tags, desc, transcript });
    } catch (e) {
      return res.status(200).json({ status: 'ok', tags: ["DLS News", "Latest Updates"], desc: "", transcript: "" });
    }
  }

  // 2. Fetch Channel Videos
  if (!handle) return res.status(400).json({ error: 'Missing handle' });

  let cleanHandle = handle.replace('@', '').trim();
  let channelId = cleanHandle;

  if (!cleanHandle.startsWith('UC')) {
    const targetUrls = [
      `https://www.youtube.com/@${cleanHandle}`,
      `https://www.youtube.com/c/${cleanHandle}`,
      `https://www.youtube.com/user/${cleanHandle}`
    ];

    for (let targetUrl of targetUrls) {
      try {
        const hRes = await fetch(targetUrl, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
        if (hRes.ok) {
          const html = await hRes.text();
          const match = html.match(/"externalId"\s*:\s*"(UC[a-zA-Z0-9_-]+)"/) ||
                        html.match(/"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]+)"/) ||
                        html.match(/channel_id=(UC[a-zA-Z0-9_-]+)/) ||
                        html.match(/href="https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)"/);
          if (match && match[1]) {
            channelId = match[1];
            break;
          }
        }
      } catch (e) {}
    }
  }

  try {
    const rssRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!rssRes.ok) throw new Error('RSS Fetch Failed');

    const xmlText = await rssRes.text();
    const items = [];
    const entryMatches = xmlText.match(/<entry>[\s\S]*?<\/entry>/g) || [];

    for (let entry of entryMatches.slice(0, 6)) {
      const titleMatch = entry.match(/<title>(.*?)<\/title>/);
      const videoIdMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const pubMatch = entry.match(/<published>(.*?)<\/published>/);

      if (videoIdMatch && titleMatch) {
        let title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&amp;/g, '&');
        items.push({
          title: title,
          videoId: videoIdMatch[1],
          published: pubMatch ? new Date(pubMatch[1]).toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' }) : 'हाल ही में'
        });
      }
    }

    const channelTitleMatch = xmlText.match(/<title>(.*?)<\/title>/);
    const channelName = channelTitleMatch ? channelTitleMatch[1] : handle;

    return res.status(200).json({ status: 'ok', channelName, items });
  } catch (err) {
    return res.status(500).json({ error: 'Failed' });
  }
}
