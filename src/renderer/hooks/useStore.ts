import { useSyncExternalStore } from 'react';
import type { Store } from '../state/store';

/** Subscribes to a slice of a store. The selector must return a referentially stable value (primitive or stored object). */
export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}
