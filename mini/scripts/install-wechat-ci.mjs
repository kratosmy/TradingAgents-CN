import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  createOperatorWechatCiInstallPlan,
  formatOperatorWechatCiInstallReport,
  installOperatorWechatCiDependency,
} = require('../lib/wechat-ci-upload.js')

try {
  const argv = process.argv.slice(2)

  if (argv.includes('--dry-run')) {
    const installPlan = createOperatorWechatCiInstallPlan({
      env: process.env,
      cwd: process.cwd(),
    })
    process.stdout.write(formatOperatorWechatCiInstallReport({ installed: false, installPlan }))
  } else {
    const installPlan = installOperatorWechatCiDependency({
      env: process.env,
      cwd: process.cwd(),
    })
    process.stdout.write(formatOperatorWechatCiInstallReport({ installed: true, installPlan }))
  }
} catch (error) {
  process.stderr.write(`mini install:wechat-ci fatal: ${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exitCode = 1
}
