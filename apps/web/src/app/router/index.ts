// Only the composition root. `ROUTES` is deliberately *not* re-exported here: it is
// imported by components that the router itself renders, and putting both behind one
// barrel makes every `ROUTES` import pull the whole page graph in a cycle.
export { router } from './router';
