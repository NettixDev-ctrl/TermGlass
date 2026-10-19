## TermGlass

A minimal, glass-inspired terminal emulator: real shells, split panes, command palette, themes and a shell selector. Built with Electron, xterm.js and node-pty.

Минималистичный терминал в стиле «стекла»: настоящие шеллы, панели, палитра команд, темы и выбор шелла.

### Downloads / Загрузки

| File | For |
| --- | --- |
| `termglass-*.pkg.tar.zst` | Arch Linux / CachyOS: `sudo pacman -U termglass-*.pkg.tar.zst` |
| `TermGlass-*-linux-x64.AppImage` | Any Linux (`chmod +x` and run) |
| `TermGlass-*-linux-x64.tar.gz` | Any Linux, unpacked |
| `TermGlass-Setup-*.exe`, `TermGlass-*-portable.exe` | Windows (**untested**) |
| `SHA256SUMS.txt` | Checksums of every file above |

### What has been tested / Что проверено

- **Linux** (CachyOS, KDE Plasma, Wayland): unit tests and end-to-end suites against the real app. The AppImage itself has not been launched.
- **Windows:** built by CI but **never run on a real Windows machine**. Treat it as experimental.
- **macOS:** no build is provided.

Full status table and details: [README](https://github.com/NettixDev-ctrl/TermGlass#status) · [README на русском](https://github.com/NettixDev-ctrl/TermGlass/blob/main/README.ru.md#статус)
