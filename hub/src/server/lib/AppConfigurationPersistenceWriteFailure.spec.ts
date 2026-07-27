import { expect, test, vi } from 'vitest'
import { EventEmitter } from 'events'
import { AppConfiguration } from './AppConfiguration'
import AppConfigurationPersistence from './AppConfigurationPersistence'

// Deliberately its own file. The check has to let the 500ms debounce actually
// elapse, and vitest isolates per file - in AppConfigurationPersistence.spec.ts
// that wait would also let *that* suite's pending debounced saves fire, and they
// are constructed against the checked-in fixtures/ files, which they would then
// rewrite in place.
//
// The debounced save used to be `setTimeout(this.save.bind(this), 500)`, which
// discards the promise. A read-only SD card - the normal end of life for a Pi
// card - therefore turned every config change into an unhandled rejection, and
// Node >=15 exits on those: the hub died mid-show because an operator patched a
// camera to a different channel.
test('a failed debounced write is logged, not left as an unhandled rejection', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const emitter = new EventEmitter()
    const config = new AppConfiguration(emitter)
    // a path whose parent directory does not exist: writeFile rejects, the same
    // way it does on a read-only or full filesystem
    new AppConfigurationPersistence(config, emitter, "/tmp/this/dir/does/not/exist/config.json")

    const rejections: unknown[] = []
    const onUnhandled = (reason: unknown) => { rejections.push(reason) }
    process.on('unhandledRejection', onUnhandled)
    let logged: unknown[][]
    try {
        config.setMixerSelection("mock") // -> config.changed -> scheduleSave
        await new Promise(resolve => setTimeout(resolve, 800)) // past the 500ms debounce
        logged = errors.mock.calls // read before restoring the spy clears them
    } finally {
        process.off('unhandledRejection', onUnhandled)
        vi.restoreAllMocks()
    }

    expect(rejections).toEqual([])
    // and it is not swallowed silently either
    expect(logged.some(call => JSON.stringify(call).includes("error when saving file"))).toBe(true)
})
