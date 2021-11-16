import { window, workspace } from "vscode";
import { fistLetterUpper } from "./utils";

// 讲文件名转换为header guard
export function getHeaderGuard(fileName: string): string {
    let name = fileName.replace(/^.*[\\\/]/, '').replace(/\.[^\.]+$/, '');
    let headerGuard: any = workspace.getConfiguration("ccls").get<string>('cpphelper.headerGuardPattern');
    return headerGuard.replace('{FILE}', name.toUpperCase());
}

export function classTemplate(className: string): string {
    return `class ${className}
{
public:
    ${className}();
    ~${className}();
private:
};`;
}

export function unitTestTemplate(fileName: string): string {
    return `#include "benchmark/benchmark.h"
#include "gtest/gtest.h"

TEST(Test${fistLetterUpper(fileName)}, base)
{

}
`;
}

// 查找文件中的header guard位置
export function findHeaderGuardLinesToRemove(): Array<number> {
    const editor = window.activeTextEditor;
    if (editor === undefined) {
        return [];
    }
    const matchAll = (str: string, reg: RegExp) => {
        let res = [];
        let match;
        while (match = reg.exec(str)) {
            res.push(match);
        }
        return res;
    };

    const document = editor.document;
    const text = document.getText();
    const match1 = /^#ifndef\s+(\S+)\s*$/m.exec(text);
    const match2 = /^#define\s+(\S+)\s*$/m.exec(text);
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const match3_block = /^#endif\s+\/\*\s+(\S+)\s*\*\/\s*$/m.exec(text);
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const match3_line = /^#endif\s+\/\/\s+(\S+)\s*$/m.exec(text);
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const tmpReg = /^#endif\s*$/gm;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    let match3_none = matchAll(text, tmpReg);

    let match3Index;
    let match3Macro;
    if (match3_block !== null) {
        match3Index = match3_block.index;
        match3Macro = match3_block[1];
    } else if (match3_line !== null) {
        match3Index = match3_line.index;
        match3Macro = match3_line[1];
    } else if (match3_none.length > 0) {
        match3Index = match3_none[match3_none.length - 1].index;
    } else {
        return [];
    }

    if (!match1 || !match2 || match3Index === undefined) {
        return [];
    }

    if (match1[1] !== match2[1]) {
        return [];
    }

    if (match3Macro !== undefined && match2[1] !== match3Macro) {
        return [];
    }

    if (match1.index > match2.index || match2.index > match3Index) {
        return [];
    }

    return [
        document.positionAt(match1.index).line,
        document.positionAt(match2.index).line,
        document.positionAt(match3Index).line,
    ];
}