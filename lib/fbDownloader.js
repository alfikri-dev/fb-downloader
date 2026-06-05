/**
 * fbDownloader.js — Facebook video downloader module
 *
 * Wrapper tipis di atas yt-dlp. Mendukung:
 *   - Facebook Reels (/reel/, /watch/, /share/r/, /videos/)
 *   - Stream info (judul, thumbnail, durasi, format list)
 *   - Download ke path pilihan
 *   - Format selection (best, mp4-only, audio-only)
 *
 * Usage:
 *   const { getInfo, download } = require('./lib/fbDownloader')
 */

'use strict'

const { execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

// ─── Konfigurasi ─────────────────────────────────────────────────────────────

const YT_DLP = process.env.YTDLP_BIN || '/root/.hermes/hermes-agent/venv/bin/yt-dlp'
const DEFAULT_OUTPUT_DIR = process.env.FB_DL_OUTPUT_DIR || path.join(os.tmpdir(), 'fb_downloads')
const TIMEOUT_MS = parseInt(process.env.FB_DL_TIMEOUT_MS || '120000', 10) // 2 menit

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Jalankan yt-dlp dengan args tertentu.
 * @param {string[]} args
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proc = execFile(YT_DLP, args, { timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`yt-dlp error: ${stderr || err.message}`))
      } else {
        resolve({ stdout, stderr })
      }
    })
    // Forward stderr ke console agar server bisa log progress
    proc.stderr?.on('data', d => process.stdout.write('[yt-dlp] ' + d))
  })
}

/**
 * Validasi apakah URL terlihat seperti URL Facebook.
 * @param {string} url
 * @returns {boolean}
 */
function isFacebookUrl(url) {
  try {
    const u = new URL(url)
    return /(?:^|\.)facebook\.com$/.test(u.hostname) ||
           /(?:^|\.)fb\.watch$/.test(u.hostname)
  } catch {
    return false
  }
}

// ─── API Publik ───────────────────────────────────────────────────────────────

/**
 * Ambil metadata video Facebook tanpa download.
 *
 * @param {string} url  - URL video Facebook (publik)
 * @returns {Promise<VideoInfo>}
 *
 * @typedef {Object} VideoInfo
 * @property {string}   id
 * @property {string}   title
 * @property {string}   description
 * @property {number}   duration          - detik
 * @property {string}   thumbnail
 * @property {string}   webpage_url
 * @property {string}   uploader
 * @property {Format[]} formats
 *
 * @typedef {Object} Format
 * @property {string} format_id
 * @property {string} ext
 * @property {number|null} width
 * @property {number|null} height
 * @property {number|null} tbr            - total bitrate kbps
 * @property {string} vcodec
 * @property {string} acodec
 * @property {string} format_note
 */
async function getInfo(url) {
  if (!isFacebookUrl(url)) {
    throw new Error('URL bukan Facebook: ' + url)
  }

  const { stdout } = await runYtDlp([
    '--no-playlist',
    '--dump-json',
    '--no-warnings',
    url
  ])

  const raw = JSON.parse(stdout)

  return {
    id: raw.id,
    title: raw.title || '(no title)',
    description: raw.description || '',
    duration: raw.duration || 0,
    thumbnail: raw.thumbnail || null,
    webpage_url: raw.webpage_url || url,
    uploader: raw.uploader || raw.channel || '',
    formats: (raw.formats || []).map(f => ({
      format_id: f.format_id,
      ext: f.ext,
      width: f.width || null,
      height: f.height || null,
      tbr: f.tbr || null,
      vcodec: f.vcodec || 'none',
      acodec: f.acodec || 'none',
      format_note: f.format_note || ''
    }))
  }
}

/**
 * Download video Facebook ke disk.
 *
 * @param {string} url
 * @param {DownloadOptions} [opts]
 * @returns {Promise<DownloadResult>}
 *
 * @typedef {Object} DownloadOptions
 * @property {string}  [outputDir]     - direktori output (default: /tmp/fb_downloads)
 * @property {string}  [format]        - format yt-dlp: 'best', 'mp4', 'audio', atau format_id eksplisit
 * @property {string}  [filename]      - nama file output (tanpa ekstensi)
 * @property {boolean} [mergeAudio]    - pastikan audio+video digabung (default true)
 *
 * @typedef {Object} DownloadResult
 * @property {string} filePath     - path absolut file hasil download
 * @property {string} filename     - nama file saja
 * @property {string} title        - judul video
 * @property {number} filesize     - bytes
 * @property {string} ext          - ekstensi
 */
async function download(url, opts = {}) {
  if (!isFacebookUrl(url)) {
    throw new Error('URL bukan Facebook: ' + url)
  }

  const outputDir = opts.outputDir || DEFAULT_OUTPUT_DIR
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Pilih format
  let formatArg = 'bestvideo+bestaudio/best'
  if (opts.format === 'mp4') {
    formatArg = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
  } else if (opts.format === 'audio') {
    formatArg = 'bestaudio/best'
  } else if (opts.format && opts.format !== 'best') {
    // format_id eksplisit dari user
    formatArg = opts.format
  }

  // Template nama file
  const fileTemplate = opts.filename
    ? path.join(outputDir, opts.filename + '.%(ext)s')
    : path.join(outputDir, '%(title).80s_%(id)s.%(ext)s')

  const args = [
    '--no-playlist',
    '--restrict-filenames',
    '-f', formatArg,
    '-o', fileTemplate,
    '--no-warnings'
  ]

  // Audio-only → extract ke mp3
  if (opts.format === 'audio') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0')
  } else if (opts.mergeAudio !== false) {
    // Gabung audio+video kalau terpisah
    args.push('--merge-output-format', 'mp4')
  }

  args.push(url)

  // Jalankan download
  await runYtDlp(args)

  // Temukan file hasil download
  const ext = opts.format === 'audio' ? 'mp3' : 'mp4'
  const files = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.' + ext) || f.endsWith('.webm') || f.endsWith('.mkv'))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(outputDir, f)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time) // paling baru duluan

  if (!files.length) {
    throw new Error('File hasil download tidak ditemukan di ' + outputDir)
  }

  const latestFile = files[0].name
  const filePath = path.join(outputDir, latestFile)
  const stat = fs.statSync(filePath)

  return {
    filePath,
    filename: latestFile,
    title: latestFile.replace(/_[A-Za-z0-9_-]+\.\w+$/, '').replace(/_/g, ' '),
    filesize: stat.size,
    ext: path.extname(latestFile).slice(1)
  }
}

module.exports = { getInfo, download, isFacebookUrl, YT_DLP }
