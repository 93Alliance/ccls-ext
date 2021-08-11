# ccls-ext README

First of all, many thanks to MaskRay's [vscode-ccls](https://github.com/MaskRay/ccls/wiki/Visual-Studio-Code), this plugin is forked vscode-ccls and adds some features.

## Features


## Requirements

- cmake tools

## Extension Settings

Reference [vscode-ccls](https://github.com/MaskRay/ccls/wiki/Visual-Studio-Code)

```
"ccls.ext.restartDatabaseOnChange": true,
"ccls.ext.changeDatabaseCompiler": {
    "windows": {
        "compiler": "cl.exe",
        "value": "/usr/bin/clang++"
    },
    "linux": {
        "compiler": "",
        "value": ""
    }
}
```

## Known Issues


## Release Notes
ccls extensions

### 0.0.1
### 0.0.4
- fix: when `changeDatabaseCompiler` is empty, copy compdb file to workspace folder


-----------------------------------------------------------------------------------------------------------
## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

### For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
