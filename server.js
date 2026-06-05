/**
 * server.js — REST API server untuk Facebook video downloader
 *
 * Endpoints:
 *   GET  /health                → health check
 *   GET  /info?url=...          → metadata video (JSON)
 *   POST /download              → download video (JSON, simpan ke output dir)
 *   POST /download/base64       → download + return sebagai base64 (untuk preview di browser)
 *
 * Body POST /download:
 *   { "url": "...", "format": "best"|"mp4"|"audio", "filename": "optional" }
 */

'use strict'

const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')

const { getInfo, download } = require('./lib/fbDownloader')

const app = express()
const PORT = parseInt(process.env.PORT || '3000', 10)
const OUTPUT_DIR = process.env.FB_DL_OUTPUT_DIR || path.join(require('os').tmpdir(), 'fb_downloads')

// Middleware
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Pastikan output dir ada saat server start
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    outputDir: OUTPUT_DIR,
    timestamp: new Date().toISOString()
  })
})

/**
 * Ambil info / metadata video
 * GET /info?url=https://www.facebook.com/...
 */
app.get('/info', async (req, res) => {
  const url = req.query.url
  if (!url) {
    return res.status(400).json({ error: 'Query param "url" wajib diisi' })
  }

  try {
    const info = await getInfo(url)
    res.json({ success: true, data: info })
  } catch (err) {
    console.error('[GET /info]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * Download video ke output dir server
 * POST /download
 * body: { url, format?, filename? }
 */
app.post('/download', async (req, res) => {
  const { url, format, filename } = req.body || {}

  if (!url) {
    return res.status(400).json({ success: false, error: 'Field "url" wajib diisi di body' })
  }

  try {
    const result = await download(url, {
      format: format || 'best',
      filename: filename || null,
      outputDir: OUTPUT_DIR
    })

    res.json({
      success: true,
      data: {
        ...result,
        downloadUrl: `/files/${encodeURIComponent(result.filename)}`,
        sizeMB: (result.filesize / 1024 / 1024).toFixed(2)
      }
    })
  } catch (err) {
    console.error('[POST /download]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * Download + return base64 (langsung)
 * Cocok untuk client yang tidak bisa akses /files
 */
app.post('/download/base64', async (req, res) => {
  const { url, format } = req.body || {}

  if (!url) {
    return res.status(400).json({ success: false, error: 'Field "url" wajib diisi' })
  }

  try {
    const result = await download(url, {
      format: format || 'best',
      outputDir: OUTPUT_DIR
    })

    const buffer = fs.readFileSync(result.filePath)
    const base64 = buffer.toString('base64')

    res.json({
      success: true,
      data: {
        filename: result.filename,
        mimetype: result.ext === 'mp3' ? 'audio/mpeg' : 'video/mp4',
        size: result.filesize,
        base64
      }
    })
  } catch (err) {
    console.error('[POST /download/base64]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * Sajikan file hasil download sebagai attachment
 */
app.get('/files/:filename', (req, res) => {
  const filename = req.params.filename
  // Sanitasi: cegah path traversal
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' })
  }

  const filePath = path.join(OUTPUT_DIR, filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File tidak ditemukan' })
  }

  res.download(filePath, filename)
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan' })
})

// Error handler global
app.use((err, req, res, next) => {
  console.error('[server error]', err)
  res.status(500).json({ success: false, error: err.message || 'Internal server error' })
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Facebook Downloader API listening on http://0.0.0.0:${PORT}`)
  console.log(`Output directory: ${OUTPUT_DIR}`)
  console.log(`Endpoints:`)
  console.log(`  GET  /health`)
  console.log(`  GET  /info?url=...`)
  console.log(`  POST /download           (body: {url, format?, filename?})`)
  console.log(`  POST /download/base64    (body: {url, format?})`)
  console.log(`  GET  /files/:filename`)
})
