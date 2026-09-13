/** Publication payload policy shared by static manifests and packed tarballs. */

/**
 * Whether a package manifest exports generated Host-for-Client metadata.
 * @param manifest - parsed package manifest to inspect.
 * @returns whether the canonical `./remote` export pair is present.
 */
export function hasTypertRemoteNavigation(manifest: unknown): boolean {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return false
  const exportsField = (manifest as Record<string, unknown>).exports
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) return false
  const remote = (exportsField as Record<string, unknown>)['./remote']
  if (remote === null || typeof remote !== 'object' || Array.isArray(remote)) return false
  const entry = remote as Record<string, unknown>
  return entry.types === './lib/typert.remote-client.d.ts'
    && entry.default === './lib/typert.remote-client.js'
}

/** Normalize a package manifest path or npm tarball member to its payload-relative path. */
function payloadPath(file: string): string {
  const normalized = file.replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/\/+$/, '')
  return normalized.startsWith('package/') ? normalized.slice('package/'.length) : normalized
}

/**
 * Whether a package payload path exposes source or map intermediates. Maps
 * serve editor navigation during development, where a workspace consumer
 * resolves their source through the package link; a published map resolves
 * nothing, so no payload publishes one.
 * @param file - manifest path or tarball member to classify.
 * @returns whether publishing this path is forbidden.
 */
export function isForbiddenPublicationFile(file: string): boolean {
  const normalized = payloadPath(file)
  return normalized === 'src'
    || normalized.startsWith('src/')
    || normalized.endsWith('.d.ts.map')
    || normalized.endsWith('.js.map')
}

/**
 * Reject source and map members in a packed npm tarball.
 * @param files - tarball members to validate.
 * @param context - tarball identity named in the failure.
 */
export function validateTarballPayload(files: readonly string[], context: string): void {
  for (const file of files) {
    if (!isForbiddenPublicationFile(file)) continue
    const normalized = payloadPath(file)
    if (normalized === 'src' || normalized.startsWith('src/')) {
      throw new Error(`${context} publishes source file ${file}`)
    }
    throw new Error(`${context} publishes source map ${file}`)
  }
}

/**
 * The concrete export targets a manifest's `exports` field names.
 *
 * Wildcard subpaths (`./src/*` and kin) select no concrete target and are
 * skipped: this repository's source subpaths exist for workspace consumers
 * resolving through the package link, not as files a tarball carries.
 * @param manifest - parsed manifest to read.
 * @returns The payload-relative export targets, deduplicated.
 */
export function declaredExportTargets(manifest: unknown): string[] {
  const root = manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)
    ? undefined
    : (manifest as Record<string, unknown>).exports
  if (root === undefined) return []
  if (typeof root === 'string') return [root]
  if (typeof root !== 'object' || Array.isArray(root)) {
    throw new Error(`manifest exports is not a string or a subpath map: ${String(typeof root)}`)
  }
  const targets = new Set<string>()
  for (const [subpath, value] of Object.entries(root as Record<string, unknown>)) {
    if (subpath.includes('*')) continue
    if (typeof value === 'string') {
      targets.add(value)
      continue
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`manifest exports entry "${subpath}" is not a string or a condition map`)
    }
    for (const [condition, target] of Object.entries(value as Record<string, unknown>)) {
      if (typeof target !== 'string') {
        throw new Error(`manifest exports entry "${subpath}" condition "${condition}" names no string target`)
      }
      targets.add(target)
    }
  }
  return [...targets]
}

/**
 * Every non-source export target a dsh family member declares must be present
 * in its packed payload. The payload never publishes `src/` (see
 * {@link isForbiddenPublicationFile}), so a source subpath or target is
 * exempt: it serves the workspace consumer that resolves through the package
 * link, and no tarball member can stand in for it.
 *
 * The check runs at pack, where `files` has already selected the payload: a
 * member whose manifest points at an artifact its `files` field omits fails
 * the release rehearsal instead of publishing a package whose export map
 * dangles. External consumers are the reason the guarantee stands — a settings
 * card built outside this repository resolves its types through these export
 * targets, and a missing one is a silent break it cannot diagnose.
 * @param manifest - the packed member's parsed manifest.
 * @param files - every path inside the packed tarball.
 * @param context - member name named in the failure.
 */
export function validateDeclaredExports(manifest: unknown, files: readonly string[], context: string): void {
  const present = new Set(files.map(payloadPath))
  for (const rawTarget of declaredExportTargets(manifest)) {
    const target = payloadPath(rawTarget)
    if (target === 'package.json') continue
    if (target === 'src' || target.startsWith('src/')) continue
    if (!present.has(target)) {
      throw new Error(`${context} declares export target ${rawTarget} absent from its packed payload`)
    }
  }
}
