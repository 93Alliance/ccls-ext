import { Disposable  } from "vscode";
import * as cp from "child_process";

export function disposeAll(items: Disposable[]): any[] {
    return items.reverse().map((d) => d.dispose());
}

export function execShell(cmd: string) {
  return new Promise<string>((resolve, reject) => {
    cp.exec(cmd, (err, out) => {
      if (err) {
        return reject(err);
      }
      return resolve(out);
    });
  });
}