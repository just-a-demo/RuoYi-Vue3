import { computed, defineComponent, h, KeepAlive, provide, shallowReactive, watch, withDirectives, vShow } from 'vue'
import { matchedRouteKey, routeLocationKey, routerViewLocationKey } from 'vue-router'
import { tabCacheKey } from '../../utils/tabCache.js'

function createTabView(path) {
  return defineComponent({
    name: tabCacheKey({ path }),
    props: ['view', 'route'],
    setup(props) {
      // Inactive pages must not observe another tab's params or query and reset themselves.
      const route = shallowReactive({ ...props.route })
      watch(() => props.route, value => Object.assign(route, value))
      provide(routeLocationKey, route)
      provide(routerViewLocationKey, computed(() => route))
      provide(matchedRouteKey, computed(() => route.matched[route.matched.length - 1]))
      return () => props.view
    }
  })
}

export default defineComponent({
  name: 'RouteCache',
  props: ['view', 'route', 'include'],
  setup(props) {
    const types = new Map()
    const mountedPages = shallowReactive(new Map())
    const typeFor = path => {
      if (!types.has(path)) types.set(path, createTabView(path))
      return types.get(path)
    }
    watch(() => [props.view, props.route, [...props.include]], () => {
      const path = props.route.path
      for (const key of mountedPages.keys()) {
        if (key !== path && !props.include.includes(tabCacheKey({ path: key }))) mountedPages.delete(key)
      }
      for (const key of types.keys()) {
        if (key !== path && !props.include.includes(tabCacheKey({ path: key }))) types.delete(key)
      }
      if (props.view && props.route.meta.keepMounted && !props.route.meta.noCache && !props.route.meta.link) {
        mountedPages.set(path, { view: props.view, route: { ...props.route } })
      }
    }, { immediate: true })

    return () => {
      const route = props.route
      const persistent = mountedPages.has(route.path) && route.meta.keepMounted && !route.meta.noCache
      return h('div', { class: 'route-cache' }, [
        // Keep iframe documents attached: moving them into KeepAlive storage reloads them.
        ...[...mountedPages].map(([path, page]) => withDirectives(
          h('div', { key: path, class: 'tab-page' }, [h(typeFor(path), page)]),
          [[vShow, route.path === path && !route.meta.link]]
        )),
        h(KeepAlive, { include: props.include }, {
          default: () => !persistent && !route.meta.link && props.view
            ? h(typeFor(route.path), { key: route.path, view: props.view, route: { ...route } }) : null
        })
      ])
    }
  }
})
