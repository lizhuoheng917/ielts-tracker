export const RELEASE_AREAS = [
  'Frontend',
  'Backend',
  'Admin',
  'Deployment',
  'Verification',
]

const ALLOWED_STATUSES = {
  Frontend: new Set(['changed', 'reviewed-not-needed']),
  Backend: new Set(['changed', 'reviewed-not-needed']),
  Admin: new Set(['changed', 'reviewed-not-needed']),
  Deployment: new Set(['deployed', 'not-deployed', 'failed']),
  Verification: new Set(['required', 'passed', 'blocked']),
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateReleaseImpact(manifest) {
  const errors = []

  if (!isPlainObject(manifest)) {
    return ['release-impact.json must contain a JSON object.']
  }

  if (manifest.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1.')
  }

  if (!isNonEmptyString(manifest.release)) {
    errors.push('release must be a non-empty string.')
  }

  for (const area of RELEASE_AREAS) {
    const impact = manifest[area]

    if (!isPlainObject(impact)) {
      errors.push(`${area} must be an object with status and reason.`)
      continue
    }

    if (!ALLOWED_STATUSES[area].has(impact.status)) {
      errors.push(
        `${area}.status must be one of: ${[...ALLOWED_STATUSES[area]].join(', ')}.`,
      )
    }

    if (!isNonEmptyString(impact.reason)) {
      errors.push(`${area}.reason must explain the review result.`)
    }
  }

  return errors
}
