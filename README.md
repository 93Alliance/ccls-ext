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

- ccls failed and quit

## Release Notes
ccls extensions

### 0.0.1
### 0.0.4
- fix: when `changeDatabaseCompiler` is empty, copy compdb file to workspace folder
### 0.0.5
- add `ext.resourceDir`
  ```
  {
    "windows": "",
    "linux": ""
  }
  ```
### 0.0.6
- fix: On windows platform ccls cannot be killed, resulting in memory leaks

### 0.0.7

### 0.0.8 
- fix: database command json file is not exist

### 0.0.9
- fix: Plugin runtime error
- add: The header guard is automatically created when the header file is created.
- add: Create function implementation, support:
  - global function √
  - normal calss member function √
  - normal class special member function √

### 0.1.0
- add: create cpp class header and source file.
- add: rename file auto modify header guard.
- fix: check file exist error.
- fix: 

-----------------------------------------------------------------------------------------------------------
## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

### For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
