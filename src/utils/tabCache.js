// Tags are identified by path, including separate instances of one parameterized route.
export const tabCacheKey = view => 'TabView' + encodeURIComponent(view.path)
