import { Time } from "https://cdn.skypack.dev/cosmokit@1.1.2?dts"
import { sprintf } from 'https://deno.land/std@0.143.0/fmt/printf.ts'

const c256 = [
    20, 21, 26, 27, 32, 33, 38, 39, 40, 41, 42, 43, 44, 45, 56, 57, 62,
    63, 68, 69, 74, 75, 76, 77, 78, 79, 80, 81, 92, 93, 98, 99, 112, 113,
    129, 134, 135, 148, 149, 160, 161, 162, 163, 164, 165, 166, 167, 168,
    169, 170, 171, 172, 173, 178, 179, 184, 185, 196, 197, 198, 199, 200,
    201, 202, 203, 204, 205, 206, 207, 208, 209, 214, 215, 220, 221,
]

interface LoggerLevelConfig {
    base: number
    [K: string]: LoggerLevel
}

type LoggerLevel = number | LoggerLevelConfig
type LoggerFunction = (format: any, ...param: any[]) => void
type LoggerType = 'success' | 'error' | 'info' | 'warn' | 'debug'

interface LoggerTarget {
    noColor?: boolean
    showDiff?: boolean
    showTime?: string
    print(text: string): void
}

export interface Logger extends Record<LoggerType, LoggerFunction> { }

export class Logger {
    // log levels
    static readonly SILENT = 0
    static readonly SUCCESS = 1
    static readonly ERROR = 1
    static readonly INFO = 2
    static readonly WARN = 2
    static readonly DEBUG = 3

    // global config
    static timestamp = 0
    static colors = c256
    static instances: Record<string, Logger> = {}

    static targets: LoggerTarget[] = [{
        noColor: Deno.noColor,
        print(text: string) {
            console.log(text)
        },
    }]

    static formatters: Record<string, (value: any, target: LoggerTarget, logger: Logger) => string> = {
        c: (value, target, logger) => Logger.color(target, logger.code, value),
        C: (value, target) => Logger.color(target, 15, value, ';1'),
        o: (value, target) => Deno.inspect(value, { colors: !target.noColor }).replace(/\s*\n\s*/g, ' '),
    }

    static levels: LoggerLevelConfig = {
        base: 2,
    }

    static color(target: LoggerTarget, code: number, value: any, decoration = '') {
        if (target.noColor) return '' + value
        return `\u001b[3${code < 8 ? code : '8;5;' + code}${target.noColor ? '' : decoration}m${value}\u001b[0m`
    }

    static code(name: string) {
        let hash = 0
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 3) - hash) + name.charCodeAt(i)
            hash |= 0
        }
        return Logger.colors[Math.abs(hash) % Logger.colors.length]
    }

    private code!: number;

    constructor(public name: string) {
        if (name in Logger.instances) return Logger.instances[name]

        Logger.instances[name] = this
        this.code = Logger.code(name)
        this.createMethod('success', '[S] ', Logger.SUCCESS)
        this.createMethod('error', '[E] ', Logger.ERROR)
        this.createMethod('info', '[I] ', Logger.INFO)
        this.createMethod('warn', '[W] ', Logger.WARN)
        this.createMethod('debug', '[D] ', Logger.DEBUG)
    }

    extend = (namespace: string) => {
        return new Logger(`${this.name}:${namespace}`)
    }

    createMethod(name: LoggerType, prefix: string, minLevel: number) {
        this[name] = (...args) => {
            if (this.level < minLevel) return
            const now = Date.now()
            for (const target of Logger.targets) {
                let indent = 4, output = ''
                if (target.showTime) {
                    indent += target.showTime.length + 1
                    output += Logger.color(target, 8, Time.template(target.showTime)) + ' '
                }
                output += prefix + this.color(target, this.name, ';1') + ' ' + this.format(target, indent, ...args)
                if (target.showDiff) {
                    const diff = Logger.timestamp && now - Logger.timestamp
                    output += this.color(target, ' +' + Time.format(diff))
                }
                target.print(output)
            }
            Logger.timestamp = now
        }
    }

    private color(target: LoggerTarget, value: any, decoration = '') {
        return Logger.color(target, this.code, value, decoration)
    }

    private format(target: LoggerTarget, indent: number, ...args: any[]) {
        if (args[0] instanceof Error) {
            args[0] = args[0].stack || args[0].message
        } else if (typeof args[0] !== 'string') {
            args.unshift('%O')
        }

        let index = 0
        args[0] = (args[0] as string).replace(/%([a-zA-Z%])/g, (match, format) => {
            if (match === '%%') return '%'
            index += 1
            const formatter = Logger.formatters[format]
            if (typeof formatter === 'function') {
                match = formatter(args[index], target, this)
                args.splice(index, 1)
                index -= 1
            }
            return match
        }).replace(/\n/g, '\n' + ' '.repeat(indent))

        return sprintf(args[0], ...args.slice(1))
    }

    get level() {
        const paths = this.name.split(':')
        let config: LoggerLevel = Logger.levels
        do {
            config = config[paths.shift()!] ?? config['base']
        } while (paths.length && typeof config === 'object')
        return config as number
    }

    set level(value) {
        const paths = this.name.split(':')
        let config = Logger.levels
        while (paths.length > 1) {
            const name = paths.shift()
            const value = config[name!]
            if (typeof value === 'object') {
                config = value
            } else {
                config = config[name!] = { base: value ?? config.base }
            }
        }
        config[paths[0]] = value
    }
}