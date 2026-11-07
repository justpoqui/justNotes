## Download

### 🪟 Windows PC

1. Download **justNotes-Setup-{{VERSION}}.exe** (under *Assets* below) and open it. The installer welcomes you, lets you choose where to install justNotes, and adds a Start menu and desktop shortcut. No admin password is needed for the usual location.
2. If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**. (justNotes isn't code-signed yet, so Windows doesn't recognize the publisher.)

### 🐧 Linux (Mint, Ubuntu, Debian, Chromebook)

| Your computer | Install it (recommended) | Or run without installing |
|---|---|---|
| Most PCs and laptops | `justnotes_{{VERSION}}_amd64.deb` | `justNotes-x86_64.AppImage` |
| ARM, e.g. many Chromebooks (`uname -m` says `aarch64`) | `justnotes_{{VERSION}}_arm64.deb` | `justNotes-arm64.AppImage` |

- **.deb:** in a terminal in your Downloads folder, run `sudo apt install ./justnotes_{{VERSION}}_amd64.deb` (or `_arm64.deb`). On Mint you can also double-click it. justNotes then appears in your app menu under Office.
- **AppImage:** right-click it → Properties → Permissions → *Allow executing*, or run `chmod +x justNotes-*.AppImage`. Then double-click it.

**Uninstalling:** Windows Settings → Apps → justNotes → Uninstall. Your notes in `Documents\justNotes` are always kept.

### Already have justNotes?

You don't need to download anything: the app shows **Update pending** at the top right. Click it, then **Install and restart**.

*(The `.yml` and `.blockmap` files are for the app's updater; you can ignore them.)*
