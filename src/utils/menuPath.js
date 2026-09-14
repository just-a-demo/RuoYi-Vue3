// Absolute child routes keep their configured URL even when grouped in a directory.
export function resolveMenuPath(basePath, routePath) {
  const path = routePath.startsWith('/') ? routePath : basePath + '/' + routePath
  return path.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
}
