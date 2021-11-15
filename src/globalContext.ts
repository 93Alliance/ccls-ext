import { commands, Disposable, OutputChannel, window, workspace, Uri, SnippetString, WorkspaceEdit, TextDocument, TextEditor } from 'vscode';
import { ServerContext } from "./serverContext";
import { canWriteFile, disposeAll, genDestructor, isFileExisted, isHeader, unwrap } from "./utils";
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export let cclsChan: OutputChannel | undefined;

export function logChan(msg: string) {
    if (!cclsChan) {
        console.error('!! ' + msg);
        return;
    }
    cclsChan.appendLine(msg);
}

export interface ChangeDbCompiler {
    windows: {
        compiler: string,
        value: string
    },
    linux: {
        compiler: string,
        value: string
    }
}


export class GlobalContext implements Disposable {
    public readonly chan: OutputChannel; // 日志输出通道
    private _dispose: Disposable[] = []; // 需要被销毁的对象
    private _server: ServerContext; // ccls服务实例
    private _isRunning = false; // ccls当前是否启动的标志
    private _srvCwd: string; // 打开的工作区目录
    private _init = false;
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
        const changeDbCompiler = config.get<ChangeDbCompiler>('ext.changeDatabaseCompiler', defaultChangeDbCompiler);
        const restartOnCmakeConfigured = config.get<boolean>('ext.restartDatabaseOnChange', false);
        if (restartOnCmakeConfigured) {
            const cmaketoolsConfig = workspace.getConfiguration('cmake');
            const cmaketoolsCompilePath = cmaketoolsConfig.get<string>('copyCompileCommands', "");
            if (cmaketoolsCompilePath === "") {
                window.showWarningMessage('cmake copyCompileCommands is empty');
            } else {
                logChan('[info]: start watch database file');
                var re = /\${workspaceFolder}/gi;
                const dbPath = cmaketoolsCompilePath.replace(re, this._srvCwd);
                // 检查路径文件是否存在
                fs.access(dbPath, fs.constants.F_OK, (err) => {
                    if (err) {
                        logChan(`[info]: the ${dbPath} is not exist`);
                        // fs.closeSync(fs.openSync(dbPath, 'w'));
                        fs.writeFile(dbPath, "", 'utf8', (error) => {
                            if (error) {
                                logChan(`error: failed create source file`);
                            }
                        });
                    }
                    this.wathDatabaseFileChanged(dbPath, changeDbCompiler);
                });
            }
        }

        // cpphelper
        this._dispose.push(commands.registerCommand('ccls.createHeaderGuard', this.createHeaderGuard, this));
        this._dispose.push(commands.registerCommand("ccls.createImplementation", this.createImplementation, this));
        this.listenHeaderGuard();
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

    public async createImplementation() {
        const editor = unwrap(window.activeTextEditor, "window.activeTextEditor");
        const uri = editor.document.uri;

        const lensesObjs = await this._server.hoverCommand();

        if (!lensesObjs || lensesObjs.contents.length === 0) {
            return;
        }

        // 获取文件扩展名
        let extName = path.extname(uri.path);
        // 获取文件名
        const fileName = path.basename(uri.path, extName);
        // 获取文件夹名
        const dirName = path.dirname(uri.path);

        let sourceExtName = "";
        if (extName === ".hpp") {
            sourceExtName = ".cpp";
        } else if (extName === ".h") {
            sourceExtName = ".c";
        } else {
            return;
        }

        // 判断源文件是否存在
        const sourceFile = dirName + "/" + fileName + sourceExtName;
        // /^\[.*\]$/
        let funcSignature = lensesObjs.contents[0].value;
        const destructFunc = new RegExp("^class.*{}$");
        if (destructFunc.test(funcSignature)) {
            // class KKK::Name{} => KKK::Name::~Name() {}
            funcSignature = genDestructor(funcSignature);
        }
        let workspaceEdit = new WorkspaceEdit();
        workspaceEdit.createFile(Uri.file(sourceFile), { overwrite: false, ignoreIfExists: true });
        workspace.applyEdit(workspaceEdit).then((result: boolean) => {
            let sourceData = "\n" + funcSignature + "\n";
            sourceData += "{\n}\n";
            if (result) { // 如果源文件不存在
                return workspace.openTextDocument(sourceFile).then((doc: TextDocument) => {
                    window.showTextDocument(doc, 1, true).then((textEditor: TextEditor) => {
                        textEditor.insertSnippet(new SnippetString("#include \"" + fileName + extName + "\"\n"))
                            .then(() => {
                                textEditor.insertSnippet(
                                    new SnippetString(sourceData), textEditor.document.positionAt(textEditor.document.getText().length));
                            });
                    });
                });
            }
            if (window.activeTextEditor) { // 如果源文件已经存在
                workspace.openTextDocument(sourceFile).then((doc: TextDocument) => {
                    window.showTextDocument(doc).then((textEditor: TextEditor) => {
                        textEditor.insertSnippet(
                            new SnippetString(sourceData), textEditor.document.positionAt(textEditor.document.getText().length));
                    });
                });
            }
        });
    }

    public async createHeaderGuard() {
        if (window.activeTextEditor && window.activeTextEditor.selection) {
            let fileName = window.activeTextEditor?.document.fileName;
            let name = fileName.replace(/^.*[\\\/]/, '').replace(/\.[^\.]+$/, '');
            let headerGuard: any = workspace.getConfiguration("ccls").get<string>('cpphelper.headerGuardPattern');
            headerGuard = headerGuard.replace('{FILE}', name.toUpperCase());
            if (window.activeTextEditor) {
                window.activeTextEditor.insertSnippet(
                    new SnippetString('\n#endif // ' + headerGuard),
                    window.activeTextEditor.document.positionAt(window.activeTextEditor.document.getText().length)
                );
                window.activeTextEditor.insertSnippet(
                    new SnippetString('#ifndef ' + headerGuard + '\n#define ' + headerGuard + '\n\n'),
                    window.activeTextEditor.document.positionAt(0)
                );
            }
        }
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
        // 都为空代表直接复制
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
        } else {
            const dstPath = this._srvCwd + '/compile_commands.json';
            fs.writeFileSync(dstPath, fs.readFileSync(dbPath));
        }

        // resolve db_path in case it is a symlink, otherwise the file system watcher
        // won't catch modifications of the linked file
        const dbRealPath = fs.realpathSync(dbPath);
        const dbWatcher = workspace.createFileSystemWatcher(dbRealPath, false, false, false);
        this._dispose.push(dbWatcher);
        dbWatcher.onDidChange(async (e: Uri) => {
            // if (!this._init) {
            //     this._init = true;
            //     return;
            // }

            if (enableChangeDbCompiler) {
                this.changeDatabaseCompiler(dbPath, compiler, compilerValue);
                if (this._isRunning) {
                    await commands.executeCommand('ccls.reload');
                }
            } else {
                const data = fs.readFileSync(dbPath, 'utf8').toString();
                const dstPath = this._srvCwd + '/compile_commands.json';
                fs.writeFileSync(dstPath, data);
                if (this._isRunning) {
                    await commands.executeCommand('ccls.reload');
                }
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
        const dstPath = this._srvCwd + '/compile_commands.json';
        fs.writeFileSync(dstPath, result);
    }

    private listenHeaderGuard() {
        /*When adding a new header file, automatically invoke insertIncludeGuard() */
        this._dispose.push(workspace.onDidCreateFiles(
            async (event) => {
                if (workspace.getConfiguration("ccls").get<boolean>('cpphelper.autoCreateHeaderGuard')) {
                    for (const newFile of event.files) {
                        if (isHeader(newFile)) {
                            workspace.openTextDocument(newFile).then(doc =>
                                window.showTextDocument(doc).then(this.createHeaderGuard)
                            );
                        }
                    }
                }
            }
        ));
    }
}
