import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { isPathInside, isRegularFileInsideRoot } from '../services/pathSecurity.js'

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'filefinder-path-security-'))
try {
  const root = path.join(temp, 'selected')
  const nested = path.join(root, 'nested')
  const outside = path.join(temp, 'outside')
  await fs.mkdir(nested, { recursive: true })
  await fs.mkdir(outside)
  const indexed = path.join(nested, 'indexed.txt')
  const external = path.join(outside, 'external.txt')
  await fs.writeFile(indexed, 'inside')
  await fs.writeFile(external, 'outside')
  const checks = [
    await isRegularFileInsideRoot(indexed, root),
    !(await isRegularFileInsideRoot(external, root)),
    !(await isRegularFileInsideRoot(root, root)),
    !(await isRegularFileInsideRoot(path.join(root, '..', 'outside', 'external.txt'), root)),
    !isPathInside(root, outside),
  ]
  let symlinkTest = null
  try {
    const link = path.join(root, 'external-link.txt')
    await fs.symlink(external, link, 'file')
    symlinkTest = !(await isRegularFileInsideRoot(link, root))
    checks.push(symlinkTest)
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error
  }
  const passed = checks.every(Boolean)
  console.log(JSON.stringify({ passed, checks: checks.length, symlinkTest: symlinkTest === null ? 'unsupported by host permissions' : symlinkTest }, null, 2))
  if (!passed) process.exitCode = 1
} finally {
  await fs.rm(temp, { recursive: true, force: true })
}
