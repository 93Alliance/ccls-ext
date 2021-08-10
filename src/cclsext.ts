import {
    Disposable,
    workspace,
    Uri,
    commands,
    window,
    OutputChannel
} from "vscode";
import { disposeAll } from "./utils";
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

export let cclsextChan: OutputChannel | undefined;

export function logChan(msg: string) {
    if (!cclsextChan) {
        console.error('!! ' + msg);
        return;
    }
    cclsextChan.appendLine(msg);
}

export class Cclsext implements Disposable {
    public readonly chan: OutputChannel; // 日志输出通道
    private _dispose: Disposable[] = [];
    private _changedCompiler = false;
    private _lastMd5 = '';

    constructor(public readonly cwd: string) {
        this.chan = window.createOutputChannel('cclsext');
        cclsextChan = this.chan;
        this._dispose.push(this.chan);
    }

    public dispose() {
        return disposeAll(this._dispose);
    }

    public async start() {
        const config = workspace.getConfiguration('cclsext');

        const defaultChangeDbCompiler = {
            windows: {
                compiler: "",
                value: ""
            },
            linux: {
                compiler: "",
                value: ""
            }
        };
        const changeDbCompiler = config.get('changeDatabaseCompiler', defaultChangeDbCompiler);

        const restartOnCmakeConfigured = config.get<boolean>('restartOnCmakeConfigured', true);
        if (restartOnCmakeConfigured) {
            this.wathDatabaseFileChanged(changeDbCompiler);
        }
    }

    private wathDatabaseFileChanged(changeDbCompiler: any) {
        let compiler: string;
        let compilerValue = "";
        let enableChangeDbCompiler = false;
        if (os.platform() === "linux" && changeDbCompiler.linux.compiler !== "" && changeDbCompiler.linux.value !== "") {
            compiler = changeDbCompiler.linux.compiler;
            compilerValue = changeDbCompiler.linux.value;
            enableChangeDbCompiler = true;
        } else if (os.platform() === "win32" && changeDbCompiler.windows.compiler !== "" && changeDbCompiler.windows.value !== "") {
            compiler = changeDbCompiler.windows.compiler;
            compilerValue = changeDbCompiler.windows.value;
            enableChangeDbCompiler = true;
        }

        const dbPath = this.cwd + '/compile_commands.json';
        // resolve db_path in case it is a symlink, otherwise the file system watcher
        // won't catch modifications of the linked file
        const dbRealPath = fs.realpathSync(dbPath);
        const dbWatcher = workspace.createFileSystemWatcher(dbRealPath, false, false, false);
        this._dispose.push(dbWatcher);
        dbWatcher.onDidChange((e: Uri) => {
            // caculate md5
            const buffer = fs.readFileSync(dbPath).toString();
            const hash = crypto.createHash('md5');
            hash.update(buffer, 'utf8');
            const md5 = hash.digest('hex');
            if (md5 !== this._lastMd5) {
                if (enableChangeDbCompiler) {
                    if (!this._changedCompiler) {
                        this._changedCompiler = true;
                        this.changeDatabaseCompiler(compiler, compilerValue);
                        commands.executeCommand('ccls.restart');
                        this._changedCompiler = false;
                    }
                } else {
                    commands.executeCommand('ccls.restart');
                }
                this._lastMd5 = md5;
            }
        });
    }

    private changeDatabaseCompiler(compiler: string, compilerValue: string) {
        logChan('[info]: changeDatabaseCompiler');
        let re = new RegExp(`^.*${compiler}`);
        const dbPath = this.cwd + '/compile_commands.json';
        const data = fs.readFileSync(dbPath, 'utf8').toString();
        let compileCommands = JSON.parse(data);
        for (let index = 0; index < compileCommands.length; index++) {
            let element = compileCommands[index];
            // const idx = element.command.indexOf(compiler);
            element.command = element.command.replace(re, compilerValue);
        }

        let result = JSON.stringify(compileCommands);
        // 这个会导致onDidChange重新发生变化
        fs.writeFileSync(dbPath, result);
    }
}