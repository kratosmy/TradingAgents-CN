const { getCheckedInRuntimeConfig } = require('../lib/runtime-config.js')

function createLocalOnlyPaths(runtimeConfig) {
  return [...new Set([
    runtimeConfig.operatorOverrides.localRuntimeConfigPath,
    runtimeConfig.operatorOverrides.devtoolsPrivateConfigPath,
    runtimeConfig.operatorOverrides.uploadSecretsDirectory,
    runtimeConfig.operatorOverrides.uploadPrivateKeyPath,
  ].filter(Boolean))]
}

function createReleaseHandoff({
  runtimeConfig = getCheckedInRuntimeConfig(),
  packageVersion = '0.1.0',
} = {}) {
  const localOnlyPaths = createLocalOnlyPaths(runtimeConfig)

  return {
    title: 'TradingAgents Mini manual-upload handoff',
    shellVersion: packageVersion,
    appId: runtimeConfig.appId,
    truthBoundaryLabel: runtimeConfig.validation.manualUploadBoundaryLabel,
    truthBoundaryCopy: runtimeConfig.validation.manualUploadDisclosure,
    validatedNow: [
      `Checked-in AppID ${runtimeConfig.appId} remains wired through mini/project.config.json and mini/config/runtime.shared.js.`,
      'The delivered Home / Watch / Account shell is validated here through committed source, local tests, generated build proof, and offline preflight output.',
      `The checked-in runtime boundary stays in ${runtimeConfig.backend.mode} mode with a non-loopback HTTPS target (${runtimeConfig.backend.baseUrl}).`,
      'A checked-in miniprogram-ci upload scaffold exists, but it refuses to proceed until operator-injected secrets and upload metadata are provided at runtime.',
      'Manual-upload readiness here means the import shell can be handed off for operator-controlled DevTools work without claiming live backend, runtime, upload, audit, or publish completion.',
    ],
    deferredOperatorSteps: [
      `Create ${runtimeConfig.operatorOverrides.localRuntimeConfigPath} with the real HTTPS backend target and keep it local-only.`,
      `Import mini/ into WeChat DevTools while signed in as the operator; keep ${runtimeConfig.operatorOverrides.devtoolsPrivateConfigPath} machine-local.`,
      `Place any upload private key or upload-secret material under ${runtimeConfig.operatorOverrides.uploadSecretsDirectory} (for example ${runtimeConfig.operatorOverrides.uploadPrivateKeyPath}) without committing it.`,
      'Run real WeChat simulator/device verification against the chosen runtime and confirm live backend reachability outside this repository-only environment.',
      'Complete platform-side IP allowlisting, privacy/compliance setup, audit submission, and final publish actions after operator validation succeeds.',
    ],
    localOnlyPaths,
    operatorHandoffSteps: [
      'Run npm --prefix mini run preflight to confirm the checked-in shell still fails closed on illegal repo-owned config.',
      'Run npm --prefix mini run upload:wechat -- --dry-run; without injected secrets it should refuse with actionable guidance, and with injected operator inputs it should print a no-upload plan.',
      'Review mini/dist/manual-upload-handoff.md alongside mini/dist/local-preview.html and mini/dist/validation-summary.json before handing the shell to the operator.',
      'Hand off only the checked-in mini/ shell plus instructions for local-only overrides and secrets; do not hand off committed credentials because none should exist.',
    ],
  }
}

function renderList(items, prefixFactory) {
  return items.map((item, index) => `${prefixFactory(index)} ${item}`).join('\n')
}

function renderReleaseHandoffMarkdown(handoff = createReleaseHandoff()) {
  return `# ${handoff.title}\n\n- Shell version: ${handoff.shellVersion}\n- AppID: ${handoff.appId}\n\n## Truth boundary\n- ${handoff.truthBoundaryLabel}\n- ${handoff.truthBoundaryCopy}\n\n## Validated in this repo\n${renderList(handoff.validatedNow, () => '-')}\n\n## Deferred operator/runtime/upload steps\n${renderList(handoff.deferredOperatorSteps, (index) => `${index + 1}.`)}\n\n## Keep local-only and untracked\n${renderList(handoff.localOnlyPaths, () => '-')}\n\n## Operator handoff checklist\n${renderList(handoff.operatorHandoffSteps, (index) => `${index + 1}.`)}\n`
}

module.exports = {
  createReleaseHandoff,
  renderReleaseHandoffMarkdown,
}
