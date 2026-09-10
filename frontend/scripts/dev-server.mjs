/**
 * Dev server launcher.
 *
 * Vite's CLI rejects unknown flags (and camelCases anything it does not know),
 * so the backend proxy target is passed through the environment instead. Using
 * Vite's programmatic API keeps this identical on Windows and POSIX, which the
 * Playwright and screenshot workflows rely on.
 *
 * Usage:
 *   LABWATCH_API_TARGET=http://127.0.0.1:8012 node scripts/dev-server.mjs [--port 5300]
 */

import { createServer } from 'vite'

const args = process.argv.slice(2)

function flag(name, fallback) {
  const index = args.indexOf(`--${name}`)
  if (index !== -1 && args[index + 1]) return args[index + 1]
  const inline = args.find((arg) => arg.startsWith(`--${name}=`))
  return inline ? inline.slice(name.length + 3) : fallback
}

const port = Number(flag('port', process.env.PORT ?? 5173))
const host = flag('host', process.env.HOST ?? '127.0.0.1')

const server = await createServer({
  server: { host, port, strictPort: true },
})

await server.listen()
server.printUrls()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.close()
    process.exit(0)
  })
}
