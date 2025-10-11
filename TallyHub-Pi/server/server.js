import express from 'express';
import morgan from 'morgan';
import { createServer } from 'http';

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 8080;
const UPSTREAM_MANIFEST = process.env.UPSTREAM_MANIFEST || 'https://raw.githubusercontent.com/tallyhubpro/Tallyhub/main/public/firmware/firmware-manifest.json';
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60_000);

app.use(morgan('dev'));
app.use(express.static(new URL('./public', import.meta.url).pathname, { fallthrough: true }));

let cachedManifest = null; let cachedAt = 0;

app.get('/manifest', async (req, res) => {
  try {
    // Cache manifest briefly
    if (!cachedManifest || (Date.now() - cachedAt) > CACHE_TTL_MS) {
      const r = await fetch(UPSTREAM_MANIFEST, { cache: 'no-store' });
      if (!r.ok) return res.status(502).json({ error: 'Upstream manifest HTTP '+r.status });
      cachedManifest = await r.json();
      cachedAt = Date.now();
    }
    // Rewrite device URLs to our proxy to avoid CORS
    const manifest = JSON.parse(JSON.stringify(cachedManifest));
    if (manifest && manifest.devices) {
      for (const [key, dev] of Object.entries(manifest.devices)) {
        // map device key to local proxy path, preserving filename from upstream url when possible
        const filename = (typeof dev.url === 'string') ? dev.url.split('/').pop() : (key + '.bin');
        manifest.devices[key].url = req.protocol + '://' + req.get('host') + '/firmware/' + encodeURIComponent(key) + (filename ? ('?name='+encodeURIComponent(filename)) : '');
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json(manifest);
  } catch (e) {
    console.error('Manifest error', e);
    return res.status(500).json({ error: 'Manifest fetch error', detail: String(e?.message || e) });
  }
});

// Stream firmware from upstream URL in manifest, selected by device key
app.get('/firmware/:device', async (req, res) => {
  try {
    // ensure we have manifest
    if (!cachedManifest) {
      const r = await fetch(UPSTREAM_MANIFEST, { cache: 'no-store' });
      if (!r.ok) return res.status(502).send('Upstream manifest HTTP '+r.status);
      cachedManifest = await r.json();
      cachedAt = Date.now();
    }
    const key = req.params.device;
    const entry = cachedManifest?.devices?.[key];
    if (!entry || !entry.url) return res.status(404).send('Unknown device');
    // Fetch upstream asset; stream to client; set CORS
    const upstream = await fetch(entry.url, { redirect: 'follow' });
    if (!upstream.ok) return res.status(502).send('Upstream firmware HTTP '+upstream.status);
    // headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.query.name) res.setHeader('Content-Disposition', `attachment; filename="${req.query.name}"`);
    // stream body
    if (upstream.body && upstream.body.pipeTo) {
      // Node 18 fetch streams
      await upstream.body.pipeTo(new WritableStream({
        write(chunk) { res.write(Buffer.from(chunk)); },
        close() { res.end(); }
      }));
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.end(buf);
    }
  } catch (e) {
    console.error('Proxy error', e);
    return res.status(500).send('Proxy error: ' + String(e?.message || e));
  }
});

server.listen(PORT, () => {
  console.log(`TallyHub-Pi listening on http://localhost:${PORT}`);
});
