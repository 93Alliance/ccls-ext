import { commands, Disposable, OutputChannel, window, workspace, Uri } from 'vscode';
import { ServerContext } from "./serverContext";
import { disposeAll } from "./utils";
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

export let cclsChan: OutputChannel | undefined;

export function logChan(msg: string) {
    if (!cclsChan) {
        console.error('!! ' + msg);
        return;
    }
    cclsChan.appendLine(msg);
}


export class GlobalContext implements Disposable {
    public readonly chan: OutputChannel; // 日志输出通道
    private _dispose: Disposable[] = []; // 需要被销毁的对象
    private _server: ServerContext; // ccls服务实例
    private _isRunning = false; // ccls当前是否启动的标志
    private _srvCwd: string; // 打开的工作区目录
    public constructor(
    ) {
        // 在日志输出窗口创建一个ccls的标签，vscode会为其分配一个窗口，用于显示ccls的日志。
        this.chan = window.createOutputChannel('ccls');
        cclsChan = this.chan;
        this._dispose.push(this.chan);

        const wss = workspace.workspaceFolders;
        if (!wss || wss.length === 0) { throw Error("No workspace opened"); }
        this._srvCwd = wss[0].uri.fsPath;
        logChan(`Server CWD is ${this._srvCwd}`);

        // 构建一个ccls插件服务
        this._server = new ServerContext(this._srvCwd);
        // 注册命令 restart 重启动作
        this._dispose.push(commands.registerCommand('ccls.restart', async () => this.restartCmd()));
        // 注册命令 restartLazy 惰性重启
        this._dispose.push(commands.registerCommand('ccls.restartLazy', async () => this.restartCmd(true)));

        // 先执行一些前置命令
        const config = workspace.getConfiguration('ccls');
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
        const changeDbCompiler = config.get('ext.changeDatabaseCompiler', defaultChangeDbCompiler);
        const restartOnCmakeConfigured = config.get<boolean>('ext.restartDatabaseOnChange', true);
        if (restartOnCmakeConfigured) {
            const cmaketoolsConfig = workspace.getConfiguration('cmake');
            const cmaketoolsCompilePath = cmaketoolsConfig.get<string>('copyCompileCommands', "");
            if (cmaketoolsCompilePath === "") {
                window.showWarningMessage('cmake copyCompileCommands is empty');
            } else {
                logChan('[info]: start watch database file');
                var re = /\${workspaceFolder}/gi;
                const dbPath = cmaketoolsCompilePath.replace(re, this._srvCwd);
                this.wathDatabaseFileChanged(dbPath, changeDbCompiler);
            }
        }
    }

    // 销毁函数
    public async dispose() {
        disposeAll(this._dispose);
        return this.stopServer();
    }

    // 启动服务
    public async startServer() {
        // 启动ccls
        if (this._isRunning) { throw new Error("Server is already running"); }

        await this._server.start();
        this._isRunning = true;
    }

    // 停止服务
    private async stopServer() {
        if (this._isRunning) {
            this._isRunning = false;
            await this._server.stop();
            this._server.dispose();
        }
    }

    // 重新启动命令
    private async restartCmd(lazy: boolean = false) {
        await this.stopServer();
        // 重新构建一个ccls服务
        this._server = new ServerContext(this._srvCwd, lazy);
        this.chan.appendLine(`Restarting ccls, lazy mode ${lazy ? 'on' : 'off'}`);
        // 启动服务
        return this.startServer();
    }

    private wathDatabaseFileChanged(dbPath: string, changeDbCompiler: any) {
        logChan('[info]: wathDatabaseFileChanged');
        let compiler = "";
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

        // 先要执行一次
        if (enableChangeDbCompiler) {
            this.changeDatabaseCompiler(dbPath, compiler, compilerValue);
        }

        // resolve db_path in case it is a symlink, otherwise the file system watcher
        // won't catch modifications of the linked file
        const dbRealPath = fs.realpathSync(dbPath);
        const dbWatcher = workspace.createFileSystemWatcher(dbRealPath, false, false, false);
        this._dispose.push(dbWatcher);
        dbWatcher.onDidChange(async (e: Uri) => {
            if (enableChangeDbCompiler) {
                this.changeDatabaseCompiler(dbPath, compiler, compilerValue);
                if (this._isRunning) {
                    await commands.executeCommand('ccls.restart');
                }
            }
            if (this._isRunning) {
                await commands.executeCommand('ccls.restart');
            }
        });
    }

    private changeDatabaseCompiler(dbPath: string, compiler: string, compilerValue: string) {
        logChan('[info]: changeDatabaseCompiler');
        let re = new RegExp(`^.*${compiler}`);
        const data = fs.readFileSync(dbPath, 'utf8').toString();
        let compileCommands = JSON.parse(data);
        for (let index = 0; index < compileCommands.length; index++) {
            let element = compileCommands[index];
            element.command = element.command.replace(re, compilerValue);
        }

        let result = JSON.stringify(compileCommands);
        // 这个会导致onDidChange重新发生变化
        const dstPath = this._srvCwd + '/compile_commands.json';
        fs.writeFileSync(dstPath, result);
    }
}
