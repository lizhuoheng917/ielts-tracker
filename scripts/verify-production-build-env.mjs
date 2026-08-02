import { loadEnv } from 'vite'

import { validateProductionBuildEnvironment } from './production-build-env-contract.mjs'

const environment = loadEnv('production', process.cwd(), '')
const errors = validateProductionBuildEnvironment(environment)

if (errors.length > 0) {
  console.error('Production build environment check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('Production build is pinned to the reviewed Lexi project with a browser-safe publishable key.')
}
