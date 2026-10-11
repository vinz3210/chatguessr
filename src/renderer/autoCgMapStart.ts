/** GeoGuessr's official maps use slugs; community maps use hexadecimal IDs. */
export function isAutoCgMapPage(pathname: string, mapId: string) {
  return (
    /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(mapId) &&
    pathname.replace(/\/$/, '').endsWith(`/maps/${mapId}`)
  )
}

export function isAutoCgGamePage(pathname: string) {
  return /^\/(?:[a-zA-Z-]{2,5}\/)?game\/[^/]+\/?$/.test(pathname)
}
