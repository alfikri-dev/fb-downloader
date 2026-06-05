# Facebook Video Downloader — Node.js

REST API server + library module untuk download video Facebook secara otomatis. Powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Features

✅ **REST API server** — Express.js, CORS enabled  
✅ **Library module** — Reusable di project lain  
✅ **Format selection** — best, mp4, audio, custom  
✅ **Metadata extraction** — judul, durasi, thumbnail, format list  
✅ **Base64 streaming** — direct response tanpa disk (untuk preview browser)  
✅ **Timeout handling** — configurable, default 2 menit  

## Installation

```bash
git clone <repo> && cd fb-downloader
npm install
```

**Require:** `yt-dlp` di PATH atau `YTDLP_BIN` env var. Check:

```bash
yt-dlp --version
```

## Quick Start

### Server Mode

```bash
npm start
# Server berjalan di http://localhost:3000
```

Endpoints:

```
GET  /health
     → { status: ok, uptime, outputDir, timestamp }

GET  /info?url=<facebook_url>
     → { success, data: { id, title, duration, formats, ... } }

POST /download
     body: { url, format?, filename? }
     → { success, data: { filePath, filename, filesize, downloadUrl, ... } }

POST /download/base64
     body: { url, format? }
     → { success, data: { filename, base64, size, mimetype } }

GET  /files/:filename
     → download file as attachment
```

### Library Mode

```javascript
const { getInfo, download } = require('./lib/fbDownloader')

// Ambil metadata
const info = await getInfo('https://www.facebook.com/share/r/...')
console.log(info.title, info.duration, info.formats)

// Download
const result = await download(info.webpage_url, {
  format: 'best',        // atau 'mp4', 'audio'
  filename: 'myvideo',   // opsional
  outputDir: '/tmp/dl'   // opsional
})
console.log(result.filePath, result.filesize)
```

## Test

```bash
node test.js "https://www.facebook.com/share/r/abc123/"
```

## Environment Variables

```bash
PORT=3000                              # Server port
FB_DL_OUTPUT_DIR=/tmp/fb_downloads     # Output directory
FB_DL_TIMEOUT_MS=120000                # yt-dlp timeout (ms)
YTDLP_BIN=/path/to/yt-dlp             # yt-dlp binary path
```

Copy `.env.example` ke `.env` dan edit:

```bash
cp .env.example .env
```

## Format Selection

Dalam `download(url, { format: '...' })`:

- `best` (default) — best available (audio + video)
- `mp4` — MP4 container, H.264 video
- `audio` — audio-only MP3
- `<format_id>` — custom dari getInfo().formats[].format_id

## API Examples

### cURL

```bash
# Get info
curl "http://localhost:3000/info?url=https://www.facebook.com/share/r/abc/"

# Download
curl -X POST http://localhost:3000/download \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.facebook.com/share/r/abc/",
    "format": "mp4"
  }'
```

### JavaScript / fetch

```javascript
// Get info
const info = await fetch(
  'http://localhost:3000/info?url=' + encodeURIComponent(fbUrl)
).then(r => r.json())

// Download
const result = await fetch('http://localhost:3000/download', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: fbUrl, format: 'mp4' })
}).then(r => r.json())

console.log(result.data.downloadUrl)  // /files/...
```

## Pitfalls

⚠️ **Private videos** — download akan gagal (FB blocks); public video saja yang support  
⚠️ **Timeout** — video sangat besar atau internet lambat bisa timeout (naikkan `FB_DL_TIMEOUT_MS`)  
⚠️ **Format mismatch** — Instagram Reels VP9 mungkin tidak play di iPhone; gunakan `ffmpeg -c:v libx264` untuk transcode  
⚠️ **Disk space** — base64 endpoint load seluruh file ke memory; cocok untuk video < 500MB  

## License

MIT
