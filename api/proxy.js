export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) return new Response("url missing", { status: 400 });

  let u;
  try { u = new URL(url); } catch { return new Response("bad url", { status: 400 }); }

  const allowed = [
    "archive.org", "us.archive.org", "wikimedia.org",
    "upload.wikimedia.org", "wikimediausercontent.org",
    "pexels.com", "pixabay.com", "noembed.com", "googleapis.com"
  ];
  if (!allowed.some(d => u.hostname.endsWith(d))) {
    return new Response("domain not allowed", { status: 403 });
  }

  try {
    const r = await fetch(u.href, { redirect: "follow" });
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    const ct = r.headers.get("content-type");
    if (ct) headers.set("Content-Type", ct);
    if (!r.body) {
      const buf = await r.arrayBuffer();
      return new Response(buf, { status: r.status, headers });
    }
    return new Response(r.body, { status: r.status, headers });
  } catch (e) {
    return new Response("fetch error", { status: 502 });
  }
}
