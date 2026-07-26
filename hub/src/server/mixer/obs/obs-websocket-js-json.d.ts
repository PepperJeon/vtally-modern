// obs-websocket-js publishes its JSON build only behind an `exports` subpath.
// Node's require() follows that map, but TypeScript's moduleResolution:"node"
// (node10) does not - it can only resolve the file path. So the runtime import
// stays `obs-websocket-js/json` and this maps the types onto the same file.
// Delete once the repo moves to moduleResolution "node16"/"bundler".
declare module 'obs-websocket-js/json' {
    export * from 'obs-websocket-js/dist/json'
    export { default } from 'obs-websocket-js/dist/json'
}
