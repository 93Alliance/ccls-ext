// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GlobalContext } from './globalContext';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// const cmakeTools = vscode.extensions.getExtension('ms-vscode.cmake-tools');
	// if (cmakeTools) {
	// 	if (!cmakeTools.isActive) {
	// 		let activeCounter = 0;
	// 		await new Promise<void>((resolve) => {
	// 			const isActive = () => {
	// 				if (cmakeTools && cmakeTools.isActive) {
	// 					return resolve();
	// 				}
	// 				activeCounter++;
	// 				if (activeCounter > 15) { // ~15 seconds timeout
	// 					return resolve(); // waiting for cmake tools timed out
	// 				}
	// 				setTimeout(isActive, 1000);
	// 			};
	// 			isActive();
	// 		});

	// 	}
	// } else {
	// 	await vscode.window.showWarningMessage('cmake tools extension is not installed or enabled');
	// 	return;
	// }
	// TODO: 垃圾cmake-tools一直没开放API，fuck
	// let cmakeToolsApi = cmakeTools?.exports;
	// cmakeToolsApi.onReconfigured(() => {
	// 	console.log("cmake tools configure complete!");
	// });

	// 构建ccls插件全局对象
	const ctx = new GlobalContext();
	// 启动ccls服务
	await ctx.startServer();
	// 将对象放到vscode内
	context.subscriptions.push(ctx);
}

// this method is called when your extension is deactivated
export function deactivate() { }
