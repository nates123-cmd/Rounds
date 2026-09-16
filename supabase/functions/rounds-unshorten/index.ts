// Follow a share link (maps.app.goo.gl, resy short links, t.co...) to its
// final URL and read the page title. Browsers cannot follow cross-origin
// redirects with visible Location headers, so this runs server-side.
//
// Deploy: supabase functions deploy rounds-unshorten --project-ref xsmnfcmtbpeaccnyinkr
// Requires a signed-in suite user (JWT verified by the gateway).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { url } = await req.json()
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error('url required')
    let current = url
    let title = ''
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetch(current, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
      const loc = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current).toString()
        continue
      }
      if ((res.headers.get('content-type') || '').includes('text/html')) {
        const html = (await res.text()).slice(0, 200000)
        const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
        const t = html.match(/<title[^>]*>([^<]*)<\/title>/i)
        title = (og?.[1] || t?.[1] || '').replace(/\s+/g, ' ').trim()
      }
      break
    }
    return new Response(JSON.stringify({ url: current, title }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
