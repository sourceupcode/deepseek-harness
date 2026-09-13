import { describe, expect, it } from 'vitest'
import {
  declaredExportTargets,
  hasTypertRemoteNavigation,
  isForbiddenPublicationFile,
  validateDeclaredExports,
  validateTarballPayload,
} from './publication-payload.ts'

function validateFixtureTarball(files: readonly string[]): () => void {
  return () => {
    validateTarballPayload(files, 'fixture.tgz')
  }
}

describe('publication payload policy', () => {
  it.each([
    'lib/index.js',
    'lib/types/index.d.ts',
    'lib/styles/base.css',
  ])('accepts %s', (file) => {
    expect(isForbiddenPublicationFile(file)).toBe(false)
  })

  it.each([
    'src',
    './src',
    'src/',
    'src/index.ts',
    './src/index.ts',
    String.raw`src\index.ts`,
    'lib/types/index.d.ts.map',
    './lib/types/index.d.ts.map',
    'lib/typert.remote-client.d.ts.map',
    'lib/client.js.map',
    './lib/client.js.map',
  ])('rejects static manifest path %s', (file) => {
    expect(isForbiddenPublicationFile(file)).toBe(true)
  })

  it('rejects source members in packed tarballs', () => {
    expect(validateFixtureTarball([
      'package/package.json',
      'package/src/index.ts',
    ])).toThrow('fixture.tgz publishes source file package/src/index.ts')
  })

  it('rejects source maps in packed tarballs', () => {
    expect(validateFixtureTarball([
      'package/package.json',
      'package/lib/types/index.d.ts.map',
    ])).toThrow('fixture.tgz publishes source map package/lib/types/index.d.ts.map')
    expect(validateFixtureTarball([
      'package/package.json',
      'package/lib/typert.remote-client.d.ts.map',
    ])).toThrow('fixture.tgz publishes source map package/lib/typert.remote-client.d.ts.map')
    expect(validateFixtureTarball([
      'package/package.json',
      'package/lib/client.js.map',
    ])).toThrow('fixture.tgz publishes source map package/lib/client.js.map')
  })

  it('accepts a clean packed tarball', () => {
    expect(validateFixtureTarball([
      'package/package.json',
      'package/lib/index.js',
      'package/lib/types/index.d.ts',
      'package/lib/styles/base.css',
    ])).not.toThrow()
  })

  it('recognizes only the canonical Host-for-Client export pair', () => {
    expect(hasTypertRemoteNavigation({
      exports: {
        './remote': {
          types: './lib/typert.remote-client.d.ts',
          default: './lib/typert.remote-client.js',
        },
      },
    })).toBe(true)
    expect(hasTypertRemoteNavigation({ exports: { './remote': './lib/remote.js' } })).toBe(false)
  })

  it('collects export targets from the string and condition-map forms', () => {
    expect(declaredExportTargets({ exports: './lib/index.js' })).toEqual(['./lib/index.js'])
    expect(declaredExportTargets({ exports: {
      '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
      './client': { types: './lib/types/client/index.d.ts', default: './lib/client.js' },
    } })).toEqual([
      './lib/types/index.d.ts', './lib/index.js',
      './lib/types/client/index.d.ts', './lib/client.js',
    ])
    expect(declaredExportTargets({})).toEqual([])
    expect(declaredExportTargets({ exports: undefined })).toEqual([])
  })

  it('skips wildcard subpaths that name no concrete target', () => {
    expect(declaredExportTargets({
      exports: { '.': './lib/index.js', './src/*': './src/*' },
    })).toEqual(['./lib/index.js'])
  })

  it('fails loud on unsupported exports forms', () => {
    expect(() => declaredExportTargets({ exports: [ 'default', './lib/index.js' ] }))
      .toThrow('manifest exports is not a string or a subpath map: object')
    expect(() => declaredExportTargets({ exports: { './client': [ 'default', './lib/client.js' ] } }))
      .toThrow('manifest exports entry "./client" is not a string or a condition map')
    expect(() => declaredExportTargets({ exports: { '.': { types: 42 } } }))
      .toThrow('manifest exports entry "." condition "types" names no string target')
  })

  it('accepts a payload covering every declared export target', () => {
    validateDeclaredExports({
      exports: {
        '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
        './client': { types: './lib/types/client/index.d.ts', default: './lib/client.js' },
        './package.json': './package.json',
      },
    }, [
      'package/package.json',
      'package/lib/index.js',
      'package/lib/client.js',
      'package/lib/types/index.d.ts',
      'package/lib/types/client/index.d.ts',
    ], 'fixture')
  })

  it('rejects a declared target the payload leaves absent', () => {
    expect(() => validateDeclaredExports({
      exports: {
        '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
        './client': { types: './lib/types/client/index.d.ts', default: './lib/client.js' },
      },
    }, [
      'package/package.json',
      'package/lib/index.js',
      'package/lib/types/index.d.ts',
      'package/lib/types/client/index.d.ts',
    ], 'fixture')).toThrow('fixture declares export target ./lib/client.js absent from its packed payload')
  })

  it('exempts source-only targets and the manifest itself', () => {
    validateDeclaredExports({
      exports: { '.': './lib/index.js', './src/*': './src/*' },
    }, [
      'package/package.json',
      'package/lib/index.js',
    ], 'fixture')
    validateDeclaredExports({ exports: { '.': './package.json' } }, [ 'package/package.json' ], 'fixture')
  })
})
