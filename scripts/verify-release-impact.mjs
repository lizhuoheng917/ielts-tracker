import { readFile } from 'node:fs/promises'

import { RELEASE_AREAS, validateReleaseImpact } from './release-impact-contract.mjs'

const manifestUrl = new URL('../release-impact.json', import.meta.url)

async function main() {
  let manifest

  try {
    manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
  } catch (error) {
    console.error(`Release impact check failed: ${error.message}`)
    process.exitCode = 1
    return
  }

  const errors = validateReleaseImpact(manifest)

  if (errors.length > 0) {
    console.error('Release impact check failed:')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
    return
  }

  console.log(`Release impact is explicit for ${RELEASE_AREAS.join(', ')}.`)
}

await main()
