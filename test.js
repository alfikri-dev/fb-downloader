/**
 * test.js — Smoke test untuk modul fbDownloader
 * Jalankan: node test.js "https://www.facebook.com/share/r/..."
 */

'use strict'

const { getInfo, download, isFacebookUrl } = require('./lib/fbDownloader')
const url = process.argv[2]

if (!url) {
  console.log('Usage: node test.js <facebook_url>')
  console.log('Contoh: node test.js https://www.facebook.com/share/r/123abc/')
  process.exit(1)
}

;(async () => {
  console.log('URL:', url)
  console.log('Is FB URL:', isFacebookUrl(url))
  console.log('')

  console.log('=== GET INFO ===')
  const info = await getInfo(url)
  console.log('Judul:', info.title)
  console.log('Durasi:', info.duration, 'detik')
  console.log('Thumbnail:', info.thumbnail)
  console.log('Format tersedia:', info.formats.length)
  info.formats.slice(0, 5).forEach(f => {
    console.log(`  ${f.format_id} | ${f.ext} | ${f.width}x${f.height} | ${f.format_note}`)
  })

  console.log('')
  console.log('=== DOWNLOAD (best quality) ===')
  const result = await download(url, { format: 'best' })
  console.log(result)
})().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
