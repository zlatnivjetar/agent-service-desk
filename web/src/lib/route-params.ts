export type RouteSearchParams = Record<string, string | string[] | undefined>

export function getRouteParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
