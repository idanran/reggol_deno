// deno-lint-ignore-file no-namespace no-explicit-any no-empty-interface
import { Time } from 'npm:cosmokit@^1.3.6'
import { getColorSupport } from 'npm:spcolor@^1.0.4'

const c16 = [6, 2, 3, 4, 5, 1]
const c256 = [
    20, 21, 26, 27, 32, 33, 38, 39, 40, 41, 42, 43, 44, 45, 56, 57, 62,
    63, 68, 69, 74, 75, 76, 77, 78, 79, 80, 81, 92, 93, 98, 99, 112, 113,
    129, 134, 135, 148, 149, 160, 161, 162, 163, 164, 165, 166, 167, 168,
    169, 170, 171, 172, 173, 178, 179, 184, 185, 196, 197, 198, 199, 200,
    201, 202, 203, 204, 205, 206, 207, 208, 209, 214, 215, 220, 221,
]

function isAggregateError(error: any): error is Error & { errors: Error[] } {
    return error instanceof Error && Array.isArray((error as any)['errors'])
}

export namespace Logger {
    export interface LevelConfig {
        base: number
        [K: string]: Level
    }

    export type Level = number | LevelConfig
    export type Function = (format: any, ...param: any[]) => void
    export type Type = 'success' | 'error' | 'info' | 'warn' | 'debug'
    export type Formatter = (value: any, target: Logger.Target, logger: Logger) => any

    export interface LabelStyle {
        width?: number
        margin?: number
        align?: 'left' | 'right'
    }

    export interface Record {
        id: number
        name: string
        type: Logger.Type
        level: number
        content: string
        timestamp: number
    }

    export interface Target {
        /**
         * - 0: no color support
         * - 1: 16 color support
         * - 2: 256 color support
         * - 3: truecolor support
         */
        colors?: false | number
        showDiff?: boolean
        showTime?: string
        label?: LabelStyle
        maxLength?: number
        record?(record: Record): void
        print?(text: string): void
    }
}

export interface Logger extends Record<Logger.Type, Logger.Function> { }

export class Logger {
    // log levels
    static readonly SILENT = 0
    static readonly SUCCESS = 1
    static readonly ERROR = 1
    static readonly INFO = 2
    static readonly WARN = 2
    static readonly DEBUG = 3

    // global config
    static id = 0
    static timestamp = 0
    static targets: Logger.Target[] = [{
        colors: getColorSupport().level,
        print(text) {
            console.log(text)
        },
    }]

    // global registry
    static formatters: Record<string, Logger.Formatter> = Object.create(null)
    static instances: Record<string, Logger> = Object.create(null)

    static format(name: string, formatter: Logger.Formatter) {
        this.formatters[name] = formatter
    }

    static levels: Logger.LevelConfig = {
        base: 2,
    }

    static color(target: Logger.Target, code: number, value: any, decoration = '') {
        if (!target.colors) return '' + value
        return `\u001b[3${code < 8 ? code : '8;5;' + code}${target.colors >= 2 ? decoration : ''}m${value}\u001b[0m`
    }

    static code(name: string, target: Logger.Target) {
        let hash = 0
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 3) - hash) + name.charCodeAt(i)
            hash |= 0
        }
        const colors = !target.colors ? [] : target.colors >= 2 ? c256 : c16
        return colors[Math.abs(hash) % colors.length]
    }

    constructor(public name: string) {
        if (name in Logger.instances) return Logger.instances[name]

        Logger.instances[name] = this
        this.createMethod('success', Logger.SUCCESS)
        this.createMethod('error', Logger.ERROR)
        this.createMethod('info', Logger.INFO)
        this.createMethod('warn', Logger.WARN)
        this.createMethod('debug', Logger.DEBUG)
    }

    extend = (namespace: string) => {
        return new Logger(`${this.name}:${namespace}`)
    }

    warning = (format: any, ...args: any[]) => {
        this.warn(format, ...args)
    }

    createMethod(type: Logger.Type, level: number) {
        this[type] = (...args) => {
            if (args.length === 1 && isAggregateError(args[0])) {
                args[0].errors.forEach(error => this[type](error))
                return
            }

            if (this.level < level) return
            const id = ++Logger.id
            const timestamp = Date.now()
            for (const target of Logger.targets) {
                const content = this.format(target, ...args)
                if (target.record) {
                    target.record({
                        id,
                        type,
                        level,
                        content,
                        timestamp,
                        name: this.name,
                    })
                    continue
                }
                const prefix = `[${type[0].toUpperCase()}]`
                const space = ' '.repeat(target.label?.margin ?? 1)
                let indent = 3 + space.length, output = ''
                if (target.showTime) {
                    indent += target.showTime.length + space.length
                    output += Logger.color(target, 8, Time.template(target.showTime)) + space
                }
                const label = this.color(target, this.name, ';1')
                const padLength = (target.label?.width ?? 0) + label.length - this.name.length
                if (target.label?.align === 'right') {
                    output += label.padStart(padLength) + space + prefix + space
                    indent += (target.label.width ?? 0) + space.length
                } else {
                    output += prefix + space + label.padEnd(padLength) + space
                }
                output += content.replace(/\n/g, '\n' + ' '.repeat(indent))
                if (target.showDiff) {
                    const diff = Logger.timestamp && timestamp - Logger.timestamp
                    output += this.color(target, ' +' + Time.format(diff))
                }
                const { maxLength = 1024, print = console.log } = target
                print(output.split(/\r?\n/g).map(line => {
                    return line.slice(0, maxLength) + (line.length > maxLength ? '...' : '')
                }).join('\n'))
            }
            Logger.timestamp = timestamp
        }
    }

    private color(target: Logger.Target, value: any, decoration = '') {
        const code = Logger.code(this.name, target)
        return Logger.color(target, code, value, decoration)
    }

    private format(target: Logger.Target, ...args: any[]) {
        if (args[0] instanceof Error) {
            args[0] = args[0].stack || args[0].message
            args.unshift('%s')
        } else if (typeof args[0] !== 'string') {
            args.unshift('%o')
        }

        let format: string = args.shift()
        format = format.replace(/%([a-zA-Z%])/g, (match, char) => {
            if (match === '%%') return '%'
            const formatter = Logger.formatters[char]
            if (typeof formatter === 'function') {
                const value = args.shift()
                return formatter(value, target, this)
            }
            return match
        })

        for (const arg of args) {
            format += ' ' + Logger.formatters['o'](arg, target, this)
        }

        return format
    }

    get level() {
        const paths = this.name.split(':')
        let config: Logger.Level = Logger.levels
        do {
            config = config[paths.shift()!] ?? config['base']
        } while (paths.length && typeof config === 'object')
        return config as number
    }

    set level(value) {
        const paths = this.name.split(':')
        let config = Logger.levels
        while (paths.length > 1) {
            const name = paths.shift()!
            const value = config[name]
            if (typeof value === 'object') {
                config = value
            } else {
                config = config[name] = { base: value ?? config.base }
            }
        }
        config[paths[0]] = value
    }
}

Logger.format('s', (value) => value)
Logger.format('d', (value) => +value)
Logger.format('j', (value) => JSON.stringify(value))
Logger.format('c', (value, target, logger) => {
    return Logger.color(target, Logger.code(logger.name, target), value)
})
Logger.format('C', (value, target) => {
    return Logger.color(target, 15, value, ';1')
})
Logger.format('o', (value, target) => {
    return Deno.inspect(value, { colors: !!target.colors }).replace(/\s*\n\s*/g, ' ')
})