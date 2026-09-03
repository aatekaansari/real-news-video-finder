// api/yt.js - Vercel Serverless Backend
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { handle, videoId } = req.query;

  // 1. अगर Video ID दी गई है तो Tags और Description निकालो
  if (videoId) {
    try {
      const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const html = await ytRes.text();

      let tags = ["DLS News", "Breaking News", "Latest Updates", "Today News"];
      let desc = "";

      const jsonMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (jsonMatch && jsonMatch[1]) {
        const data = JSON.parse(jsonMatch[1]);
        if (data.videoDetails?.keywords) tags = data.videoDetails.keywords;
        if (data.videoDetails?.shortDescription) desc = data.videoDetails.shortDescription;
      }

      return res.status(200).json({ status: 'ok', tags, desc });
    } catch (e) {
      return res.status(200).json({ status: 'ok', tags: ["DLS News", "Breaking News"], desc: "" });
    }
  }

  // 2. चैनल के वीडियो निकालो (@dlsnews या Channel ID से)
  if (!handle) {
    return res.status(400).json({ error: 'Missing handle' });
  }

  let cleanHandle = handle.replace('@', '').trim();
  let channelId = cleanHandle;

  // Handle को Channel ID (UC...) में बदलो
  if (!cleanHandle.startsWith('UC')) {
    try {
      const hRes = await fetch(`https://www.youtube.com/@${cleanHandle}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const html = await hRes.text();
      const match = html.match(/channel_id=([a-zA-Z0-9_-]+)/) || html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/);
      if (match && match[1]) {
        channelId = match[1];
      }
    } catch (e) {}
  }

  // YouTube RSS Feed खींचो
  try {
    const rssRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    const xmlText = await rssRes.text();

    const items = [];
    const entryMatches = xmlText.match(/<entry>[\s\S]*?<\/entry>/g) || [];

    for (let entry of entryMatches.slice(0, 6)) {
      const titleMatch = entry.match(/<title>(.*?)<\/title>/);
      const videoIdMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const pubMatch = entry.match(/<published>(.*?)<\/published>/);

      if (videoIdMatch && titleMatch) {
        let title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
        items.push({
          title: title,
          videoId: videoIdMatch[1],
          published: pubMatch ? new Date(pubMatch[1]).toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' }) : 'हाल ही में'
        });
      }
    }

    const channelTitleMatch = xmlText.match(/<title>(.*?)<\/title>/);
    const channelName = channelTitleMatch ? channelTitleMatch[1] : handle;

    return res.status(200).json({
      status: 'ok',
      channelName,
      items
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch YouTube RSS' });
  }
}
