import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  formatWechatCiUploadReport,
  runWechatCiUpload,
} = require('../lib/wechat-ci-upload.js')

try {
  const result = await runWechatCiUpload({
    env: process.env,
    argv: process.argv.slice(2),
    cwd: process.cwd(),
  })

  process.stdout.write(formatWechatCiUploadReport(result))

  if (!result.ok) {
    process.exitCode = 1
  }
} catch (error) {
  process.stderr.write(`mini upload fatal: ${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exitCode = 1
}
