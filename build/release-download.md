## Download

### 🪟 Windows PC

1. Download **justNotes-Setup-{{VERSION}}.exe** (under *Assets* below) and open it. justNotes installs in a few seconds, for your user only (no admin password needed), and adds a Start menu and desktop shortcut.
2. If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**. (justNotes isn't code-signed yet, so Windows doesn't recognize the publisher.)

### 🐧 Linux (Mint, Ubuntu, Debian, Chromebook)

| Your computer | Install it (recommended) | Or run without installing |
|---|---|---|
| Most PCs and laptops | `justnotes_{{VERSION}}_amd64.deb` | `justNotes-x86_64.AppImage` |
| ARM, e.g. many Chromebooks (`uname -m` says `aarch64`) | `justnotes_{{VERSION}}_arm64.deb` | `justNotes-arm64.AppImage` |

- **.deb:** in a terminal in your Downloads folder, run `sudo apt install ./justnotes_{{VERSION}}_amd64.deb` (or `_arm64.deb`). On Mint you can also double-click it. justNotes then appears in your app menu under Office.
- **AppImage:** right-click it → Properties → Permissions → *Allow executing*, or run `chmod +x justNotes-*.AppImage`. Then double-click it.

### Already have justNotes?

You don't need to download anything: the app shows **Update pending** at the top right. Click it, then **Install and restart**.

*(The `.yml` and `.blockmap` files are for the app's updater; you can ignore them.)*
