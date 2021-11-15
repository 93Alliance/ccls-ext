import * as path from "path";
import * as util from "util";
import { commands, Disposable, Uri } from "vscode";
import * as cp from "child_process";
import * as fs from 'fs';

export function resourcePath(...paths: string[]): string {
  return path.join(__dirname, "..", "resources", ...paths);
}

export function unwrap<T>(value: T | undefined, tip = "?"): T {
  if (value === undefined) { throw new Error("undefined " + tip); }
  return value;
}

export function disposeAll(items: Disposable[]): any[] {
  return items.reverse().map((d) => d.dispose());
}

export function normalizeUri(u: string): string {
  return Uri.parse(u).toString(true);
}

export function setContext(name: string, value: any): void {
  commands.executeCommand("setContext", name, value);
}

export function dedent(templateStrings: TemplateStringsArray, ...args: any[]) {
  const strings = templateStrings.map((value) => value.replace(/\r?\n[ ]*$/, '\n'));
  let result = strings[0];
  for (let i = 0; i < args.length; i++) {
    result += args[i] + strings[i + 1];
  }
  return result;
}

const setTimeoutPromised = util.promisify(setTimeout);

export async function wait(millisecs: number) {
  return setTimeoutPromised(millisecs);
}


export async function hasVscodeCommand(cmd: string): Promise<boolean> {
  const allCmds = commands.getCommands(true);
  for (const c of await allCmds) {
    if (c === cmd) {
      return new Promise<boolean>((resolve, reject) => { return resolve(true); });
    }
  }
  return new Promise<boolean>((resolve, reject) => { return resolve(false); });
}

export function isFileExisted(path: string) {
  return new Promise((resolve, reject) => {
    fs.access(path, (err: any) => {
      if (err) {
        reject(false);//"不存在"
      } else {
        resolve(true);//"存在"
      }
    });
  });
};

export function canReadFile(path: string) {
  return new Promise((resolve, reject) => {
    fs.access(path, fs.constants.R_OK, (err: any) => {
      if (err) {
        reject(false);//"不可读"
      } else {
        resolve(true);//"可读"
      }
    });
  });
}

export function canWriteFile(path: string) {
  return new Promise((resolve, reject) => {
    fs.access(path, fs.constants.W_OK, (err: any) => {
      if (err) {
        reject(false);//"不可读"
      } else {
        resolve(true);//"可读"
      }
    });
  });
}

export function genDestructor(classInfo: string): string {
  // class KKK::Name {}
  let start = 5; // class 字符长度 + 空格
  let end = classInfo.indexOf("{");
  // 获取签名 KKK::Name
  let result = classInfo.substring(start, end);
  // 去除空格 KKK::Name
  result = result.replace(/\s+/g, "");
  // 获取类名 KKK::Name~:Name()
  start = result.lastIndexOf(":") + 1;
  const className = result.substring(start);
  return result + "::~" + className + "()";
}

// 判断是否是头文件
export function isHeader(file: Uri): boolean {
  const headerExtensions = [".h", ".hpp", ".h++", ".hh"];
  return headerExtensions.some(headerExtension => file.fsPath.endsWith(headerExtension));
}