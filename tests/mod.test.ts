import { install, InstalledClock } from 'npm:@sinonjs/fake-timers@^6.0.1'
import { expect } from 'npm:chai@^4.3.6'
import { Logger } from '../mod.ts'
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    it,
} from "https://deno.land/std@0.154.0/testing/bdd.ts"

describe('Logger API', () => {
    let logger: Logger
    let data: string
    let clock: InstalledClock

    beforeAll(() => {
        clock = install({ now: Date.now() })

        Logger.targets.push({
            showDiff: true,
            print(text) {
                data += text + '\n'
            },
        })
    })

    afterAll(() => {
        Logger.targets.pop()
        clock.uninstall()
    })

    beforeEach(() => {
        data = ''
    })

    it('basic support', () => {
        logger = new Logger('test').extend('logger')
        expect(logger.name).to.equal('test:logger')
        expect(logger).to.equal(new Logger('test:logger'))
    })

    it('format error', () => {
        const error = new Error('message')
        error.stack = undefined
        logger.error(error)
        expect(data).to.equal('[E] test:logger message +0ms\n')
    })

    it('format object', () => {
        clock.tick(2)
        const object = { foo: 'bar' }
        logger.success(object)
        expect(data).to.equal("[S] test:logger { foo: 'bar' } +2ms\n")
    })

    it('custom formatter', () => {
        clock.tick(1)
        Logger.formatters.x = () => 'custom'
        logger.info('%x%%x')
        expect(data).to.equal('[I] test:logger custom%x +1ms\n')
    })

    it('log levels', () => {
        logger.debug('%c', 'foo bar')
        expect(data).to.equal('')

        logger.level = Logger.SILENT
        logger.debug('%c', 'foo bar')
        expect(data).to.equal('')

        logger.level = Logger.DEBUG
        logger.debug('%c', 'foo bar')
        expect(data).to.be.ok
    })
})