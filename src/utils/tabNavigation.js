import useTagsViewStore from '@/store/modules/tagsView'
import { tabCacheKey } from './tabCache'
import Layout from '@/layout/index.vue'

// A retained tab is not being discarded when another workspace page opens.
export function isRetainedTabNavigation(to, from, ownRoute) {
  if (from.path !== ownRoute.path) return true
  return to.matched.some(record => record.components?.default === Layout)
    && useTagsViewStore().cachedViews.includes(tabCacheKey(from))
}
