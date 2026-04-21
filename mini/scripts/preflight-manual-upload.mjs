import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  formatManualUploadPreflightReport,
  loadCheckedInManualUploadSnapshot,
  validateManualUploadReadiness,
} = require('../lib/manual-upload-preflight.js')

try {
  const snapshot = loadCheckedInManualUploadSnapshot()
  const result = validateManualUploadReadiness(snapshot)

  process.stdout.write(formatManualUploadPreflightReport(result))

  if (!result.ok) {
    process.exitCode = 1
  }
} catch (error) {
  process.stderr.write(`mini preflight fatal: ${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exitCode = 1
}
