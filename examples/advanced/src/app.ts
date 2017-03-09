// app.ts
// The main entry point for this example application.
//  - It's job is to create containers for different routes,
//    pass them sources, and hook up their sinks.
//  - main() is our main entry point
//  - run() invokes Cycle.js on our main function.
//  - Pages of our app are contained in seperate components
//    found in the containers/ subdirectory.
//  - Each container component is isolated from each other
//    with @cycle/isolate. (Actions bound to HTML tag class names
//    won't leak to other components with the same class names.)
//  - Each container follows the Sources => Sinks interface
//    defined in types.ts, including DOM, history$, etc.
//  - URLs are mapped to these component containers with patterns
//    specified in the routes array.

import xs, { Stream } from 'xstream'
import { run } from '@cycle/run'
import { makeDOMDriver } from '@cycle/dom'
import { captureClicks, makeHistoryDriver, HistoryInput } from '@cycle/history'
import isolate from '@cycle/isolate'
import { Location } from 'history'
import { Login } from './containers/login'
import { Home } from './containers/home'
import { Sources, Sinks, Route } from './types'
import * as navigation from './actions/navigation'
import * as makePathRegex from 'path-to-regexp'

// Import our deepstream driver from the parent project folder:
import { makeDeepstreamDriver } from '../../../index'

// Application URL route to component mapping:
const routes: Array<Route> = [
  { container: Home, pattern: '/' },
  { container: Login, pattern: '/login' }
]

// Application main function -
// Main routing to individual components based on the current URL.
function main(sources: Sources): Sinks {
  // Receive Source streams from our cycle drivers:
  const { DOM, history$, deep$ } = sources

  // Stream that observes the current URL path
  const path$ = history$
    .map((location: Location) => location.pathname)

  // Create each container and map it to it's route pattern - 
  // Don't hook up any of the sinks yet:
  const containers: { [pattern: string]: Sinks } = routes
    .reduce((acc, route) => (
      { ...acc, [route.pattern]: isolate(route.container)(sources) }
    ), {})

  // A Route DOM stream is a combined stream of the following:
  //  - The configured Route object (static)
  //  - The current browser Location from the path$
  //  - The most recent DOM update from the container
  // This stream is filtered to only emit when the Location matches the Route.
  const createRouteDOMStream = (route: Route) => {
    const routeRegex = makePathRegex(route.pattern)
    const container = containers[route.pattern]
    return xs.combine(xs.of(route), path$, container.DOM)
      .filter(([route, location, dom]) => routeRegex.test(location))
  }

  // Merge common sink types together into one stream:
  const createMergedSinks = (sink: string): Stream<any> => {
    const containerStreams = Object.keys(containers)
      .map(pattern => containers[pattern][sink])
    return xs.merge.apply(null, containerStreams)
  }

  //Create the main DOM stream as the combined stream of all container
  //route streams. If the route changes, the whole dom is swapped.
  const routeStreams = routes.map(route => createRouteDOMStream(route))
  const vdom$ = xs.merge.apply(null, routeStreams)
    .map(([route, location, dom]) => dom)

  // On deepstream logout, return to the login page:
  const logout$ = deep$
    .startWith({ event: 'logout' })
    .filter(effect => effect.event === 'logout')
    .map(effect => navigation.push("/login"))

  // Return our (merged and combined) Sinks back to our cycle drivers:
  return {
    DOM: vdom$,
    history$: xs.merge(createMergedSinks('history$'), logout$),
    deep$: createMergedSinks('deep$')
  }
}

// Create our main Cycle drivers and run the main:
run(main, {
  // @cycle/dom driver
  DOM: makeDOMDriver(document.body),
  // @cycle/history driver
  history$: captureClicks(makeHistoryDriver()),
  deep$: makeDeepstreamDriver('localhost:6020')
})
