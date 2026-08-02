import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { validateProductionBundleText } from './production-bundle-contract.mjs'

const distDirectory = path.resolve(process.cwd(), 'dist')
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.svg', '.txt', '.xml'])

async function collectText(directory) {
  const chunks = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) chunks.push(await collectText(target))
    else if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
      chunks.push(await readFile(target, 'utf8'))
    }
  }
  return chunks.join('\n')
}

try {
  const errors = validateProductionBundleText(await collectText(distDirectory))
  if (errors.length > 0) {
    console.error('Production bundle check failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
  } else {
    console.log('Production bundle contains the reviewed Lexi connection and no staging URL/secret-shaped token.')
  }
} catch (error) {
  console.error(`Production bundle check failed: ${error.message}`)
  process.exitCode = 1
}
