import { preview } from 'vite'

const previewServer = await preview({
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})

try {
  const response = await fetch('http://127.0.0.1:4173/')
  if (!response.ok) {
    throw new Error(`Preview returned HTTP ${response.status}`)
  }

  const document = await response.text()
  if (!document.includes('<title>Infrastructure Change Review</title>')) {
    throw new Error('Preview document is missing the expected project title')
  }

  console.info('Preview smoke test passed (HTTP 200 and expected title)')
} finally {
  await new Promise<void>((resolve, reject) => {
    previewServer.httpServer.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}
