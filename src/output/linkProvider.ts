import * as path from 'path';
import * as fs from 'fs';

import { CancellationToken, DocumentLink, DocumentLinkProvider, Position, Range, TextDocument, Uri, window, workspace, WorkspaceFolder } from "vscode";
import { fileExists, isFile } from '../utils';

const pathPrefix = '(\\.\\.?|\\~)';
const pathSeparatorClause = '\\/';
// '":; are allowed in paths but they are often separators so ignore them
// Also disallow \\ to prevent a catastropic backtracking case #24798
// const excludedPathCharactersClause = '[^\\0\\s!$`&*()\\[\\]+\'":;\\\\]';
const excludedPathCharactersClause = '[^\\0!$`&*()\\[\\]+\'":;\\\\]';

/** A regex that matches paths in the form /foo, ~/foo, ./foo, ../foo, foo/bar */
const unixLocalLinkClause = '((' + pathPrefix + '|(' + excludedPathCharactersClause + ')+)?(' + pathSeparatorClause + '(' + excludedPathCharactersClause + ')+)+)';

const winDrivePrefix = '[a-zA-Z]:';
const winPathPrefix = '(' + winDrivePrefix + '|\\.\\.?|\\~)';
const winPathSeparatorClause = '(\\\\|\\/)';
// const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!$`&*()\\[\\]+\'":;]';
const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/!$`&*()\\[\\]+\'":;]';

/** A regex that matches paths in the form c:\foo, ~\foo, .\foo, ..\foo, foo\bar */
const winLocalLinkClause = '((' + winPathPrefix + '|(' + winExcludedPathCharactersClause + ')+)?(' + winPathSeparatorClause + '(' + winExcludedPathCharactersClause + ')+)+)';

/**
 * As xterm reads from DOM, space in that case is nonbreaking char ASCII code - 160,
 * replacing space with nonBreakningSpace or space ASCII code - 32.
 */
const lineAndColumnClause = [
    // "(file path)", line 45 [see #40468]
    '((\\S*)", line ((\\d+)( column (\\d+))?))',

    // (file path) on line 8, column 13
    '((\\S*) on line ((\\d+)(, column (\\d+))?))',

    // (file path):line 8, column 13
    '((\\S*):line ((\\d+)(, column (\\d+))?))',

    // (file path)(45), (file path) (45), (file path)(45,18), (file path) (45,18), (file path)(45, 18), (file path) (45, 18), also with []
    '(([^\\s\\(\\)]*)(\\s?[\\(\\[](\\d+)(,\\s?(\\d+))?)[\\)\\]])',

    // (file path):336, (file path):336:9
    '(([^:\\s\\(\\)<>\'"\\[\\]]*)(:(\\d+))?(:(\\d+))?)',
].join('|').replace(/ /g, `[${'\u00A0'} ]`);

// Changing any regex may effect this value, hence changes this as well if required.
const winLineAndColumnMatchIndex = 12;
const unixLineAndColumnMatchIndex = 11;

// Each line and column clause have 6 groups (ie no. of expressions in round brackets)
const lineAndColumnClauseGroupCount = 6;

interface IConfiguration {
    eol: string;
}

export interface ILineColumnInfo {
    lineNumber: number;
    columnNumber: number;
}

export class LinkProvider implements DocumentLinkProvider {
    // @ts-ignore
    private processCwd: string;
    private localLinkPattern: RegExp;
    private configuration: IConfiguration;
    private startHeader = "[build] ";

    constructor() {
        this.configuration = {
            eol: workspace.getConfiguration('files', null).get('eol')!,
        };
        this.localLinkPattern =
            process.platform === 'win32' ?
                new RegExp("^\\[build\\]\\s.*?\\(\\d+\\)") :
                new RegExp("^\\[build\\]\\s.*?:(\\d+):(\\d+)");

        const wss = workspace.workspaceFolders;
        if (!wss || wss.length === 0) { throw Error("No workspace opened"); }
        this.processCwd = wss[0].uri.fsPath;
        console.log("------------", this.processCwd);
    }

    public async provideDocumentLinks(document: TextDocument, token: CancellationToken): Promise<DocumentLink[]> {
        let results: DocumentLink[] = [];
        // @ts-ignore
        // this.currentWorkspaceFolder = window.activeTextEditor ? workspace.getWorkspaceFolder(window.activeTextEditor.document.uri) : null;
        // this.processCwd = this.currentWorkspaceFolder ? this.currentWorkspaceFolder.uri.fsPath : null;
        let lines = document.getText().split(this.configuration.eol);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            let result = await this.getLinksOnLine(line, i);

            if (result.length > 0) {
                results.push(...result);
            }
        }

        return Promise.resolve(results);
    }

    public async getLinksOnLine(line: string, lineNumber: number) {
        const results: DocumentLink[] = [];
        if (line === "") {
            return results;
        }
        
        if (!line.startsWith(this.startHeader)) {
            return results;
        }

        // linux ^\[build\]\s.*?:(\d+):(\d+)
        // win ^\[build\]\s.*?\(\d+\)

        // [build] ../../../src/kit/test/Auxiliary/test_stringformat.cpp:14:5
        // [build] ..\..\..\src\kit\test\Archive\json\test_tool.cpp(412)
        // [build] D:\code\framework\src\kit\src\Archive/Json/Json.hpp(233):
        let pathWithHeader = line.match(this.localLinkPattern);
        if (pathWithHeader === null || pathWithHeader.length === 0) {
            return results;
        }
        // 去除header
        // ../../../src/kit/test/Auxiliary/test_stringformat.cpp:14:5
        // ..\..\..\src\kit\test\Archive\json\test_tool.cpp(412)
        // D:\code\framework\src\kit\src\Archive/Json/Json.hpp(233)
        let pathLink = pathWithHeader[0].substring(7);
        // 这里去除行号+列号，后续可以考虑使用ccls直接跳转。
        const endChar = process.platform === 'win32' ? "(" : ":";
        // ../../../src/kit/test/Auxiliary/test_stringformat.cpp
        // ..\..\..\src\kit\test\Archive\json\test_tool.cpp
        // D:\code\framework\src\kit\src\Archive/Json/Json.hpp
        const end = pathLink.length + 1;
        let lineColumn = pathLink.substring(pathLink.indexOf(endChar)); // (32) | :14:5
        pathLink = pathLink.substring(0, pathLink.indexOf(endChar));
        if (!path.isAbsolute(pathLink)) { // 绝对路径直接过
            let inx = pathLink.lastIndexOf('./');
            if (inx === -1) {
                inx = pathLink.lastIndexOf('.\\');
            }
            pathLink = pathLink.substring(inx + 2);
            pathLink = this.processCwd + "/" +  pathLink;
        }

        pathLink = path.normalize(pathLink);

        if (!(await fileExists(pathLink))) {
            return results;
        }

        if (!(await isFile(pathLink))) {
            return results;
        }

        let fileUri = Uri.file(pathLink);
        let lineColumnInfo = this.extractLineColumnInfo(lineColumn);

        const linkTarget = fileUri.with({ fragment: `${lineColumnInfo.lineNumber},${lineColumnInfo.columnNumber}` });
        // @ts-ignore
        // 8的含义是从1开始数 startHeader 的长度。
        results.push(new DocumentLink(new Range(new Position(lineNumber, 8), new Position(lineNumber, end)), linkTarget));
        return results;
    }

    /**
     * Returns line and column number of URl if that is present.
     *
     * @param link Url link which may contain line and column number.
     */
    public extractLineColumnInfo(link: string): ILineColumnInfo {
        const lineColumnInfo: ILineColumnInfo = {
            lineNumber: 1,
            columnNumber: 1,
        };
        // (43) | :12:3
        if (process.platform === 'win32') {
            let line = link.substring(link.indexOf("("), link.indexOf(")"));
            lineColumnInfo.lineNumber = parseInt(line, 10);
        } else {
            let line = link.substring(1, link.lastIndexOf(":"));
            let column = link.substring(link.lastIndexOf(":") + 1);
            lineColumnInfo.lineNumber = parseInt(line, 10);
            lineColumnInfo.columnNumber = parseInt(column, 10);
        }

        return lineColumnInfo;
    }

    /**
     * Returns url from link as link may contain line and column information.
     *
     * @param link url link which may contain line and column number.
     */
    // public extractLinkUrl(link: string): string | null {
    //     const matches: string[] | null = this.localLinkPattern2.exec(link);

    //     if (!matches) {
    //         return null;
    //     }

    //     return matches[1];
    // }

    private preprocessPath(link: string): string | null {
        if (process.platform === 'win32') {
            // Resolve ~ -> %HOMEDRIVE%\%HOMEPATH%
            if (link.charAt(0) === '~') {
                if (!process.env.HOMEDRIVE || !process.env.HOMEPATH) {
                    return null;
                }

                link = `${process.env.HOMEDRIVE}\\${process.env.HOMEPATH + link.substring(1)}`;
            }

            // Resolve relative paths (.\a, ..\a, ~\a, a\b)
            if (!link.match('^' + winDrivePrefix)) {
                if (!this.processCwd) {
                    // Abort if no workspace is open
                    return null;
                }

                link = path.join(this.processCwd, link);
            }
        } else if (link.charAt(0) !== '/' && link.charAt(0) !== '~') {
            // Resolve workspace path . | .. | <relative_path> -> <path>/. | <path>/.. | <path>/<relative_path>

            if (!this.processCwd) {
                // Abort if no workspace is open
                return null;
            }

            link = path.join(this.processCwd, link);
        }

        return link;
    }
}