import FakeTimers from 'npm:@sinonjs/fake-timers@10.2.0'
import { beforeEach, describe, it, beforeAll, afterAll } from "https://deno.land/std@0.192.0/testing/bdd.ts";
import chai from "npm:chai@4.3.7"
import { Logger } from "../mod.ts"

const { expect } = chai

declare global {
    interface Error {
        errors: [Error]
    }
}

describe('Logger API', () => {
    let logger: Logger
    let data: string
    let clock: any

    beforeAll(() => {
        clock = FakeTimers.install({ now: Date.now() })

        Logger.targets.push({
            showDiff: true,
            print(text: string) {
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
        logger = new Logger('test')
    })

    it('format error', () => {
        const inner = new Error('message')
        inner.stack = undefined
        const outer = new Error('outer')
        outer['errors'] = [inner]
        logger.error(outer)
        expect(data).to.equal('[E] test message +0ms\n')
    })

    it('custom formatter', () => {
        clock.tick(1)
        Logger.formatters.x = () => 'custom'
        logger.info('%x%%x')
        expect(data).to.equal('[I] test custom%x +1ms\n')
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

    it('label style', () => {
        Logger.targets[1].label = { align: 'right', width: 10, margin: 2 }
        logger.info('message\nmessage')
        expect(data).to.equal([
            '      test  [I]  message\n',
            '                 message +0ms\n',
        ].join(''))
    })
})