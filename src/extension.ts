import { Cclsext } from './cclsext';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { workspace } from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const cmakeTools = vscode.extensions.getExtension('ms-vscode.cmake-tools');
	if (cmakeTools) {
		if (!cmakeTools.isActive) {
			let activeCounter = 0;
			await new Promise<void>((resolve) => {
				const isActive = () => {
					if (cmakeTools && cmakeTools.isActive) {
						return resolve();
					}
					activeCounter++;
					if (activeCounter > 15) { // ~15 seconds timeout
						return resolve(); // waiting for cmake tools timed out
					}
					setTimeout(isActive, 1000);
				};
				isActive();
			});

		}
	} else {
		await vscode.window.showWarningMessage('cmake tools extension is not installed or enabled');
	}
	// TODO: 垃圾cmake-tools一直没开放API，fuck
	// let cmakeToolsApi = cmakeTools?.exports;
	// cmakeToolsApi.onReconfigured(() => {
	// 	console.log("cmake tools configure complete!");
	// });

	const ccls = vscode.extensions.getExtension('ccls-project.ccls');
	if (ccls) {
		if (!ccls.isActive) {
			let activeCounter = 0;
			await new Promise<void>((resolve) => {
				const isActive = () => {
					if (ccls && ccls.isActive) {
						return resolve();
					}
					activeCounter++;
					if (activeCounter > 60) { // ~60 seconds timeout
						return resolve(); // waiting for cmake tools timed out
					}
					setTimeout(isActive, 1000);
				};
				isActive();
			});
		}
	} else {
		await vscode.window.showWarningMessage('ccls extension is not installed or enabled');
	}

	const wss = workspace.workspaceFolders;
	if (!wss || wss.length === 0) { throw Error("No workspace opened"); }
	const ctx = new Cclsext(wss[0].uri.fsPath);

	await ctx.start();

	context.subscriptions.push(ctx);
}

// this method is called when your extension is deactivated
export function deactivate() { }
