const { app, BrowserWindow, ipcMain, Menu, nativeImage, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const nodeCrypto = require("crypto");
const { load, save } = require("./settings");
const { LICENSE_SALT } = require("./license.js");

function openExternal(url) {
  if (process.platform === "linux") {
    const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
  } else {
    shell.openExternal(url);
  }
}

function expectedLicenseKey(userName) {
  const hmac = nodeCrypto.createHmac("sha256", LICENSE_SALT);
  hmac.update(userName.toLowerCase().trim());
  return hmac.digest("hex").slice(0, 16).toUpperCase();
}

function isValidLicense(key, userName) {
  if (!key || !userName) return false;
  return key.toUpperCase() === expectedLicenseKey(userName);
}

const appIcon = nativeImage.createFromPath(path.join(__dirname, "app_icon.icns"));

app.name = "BengalCalc";

app.setAboutPanelOptions({
  applicationName: "BengalCalc",
  applicationVersion: require("./package.json").version,
  credits: `by Richard Lesh\nBuilt with Electron v${process.versions.electron}`,
  website: "https://glowingcatsoftware.com/BengalCalc.html",
  iconImage: appIcon
});

let mainWin, settingsWin;

function createWindow() {
  const settings = load();
  const mode = settings.mode || "algebraic";
  const layout = settings.layout || "scientific";
  let width = 640, height = 420;
  if (layout === "programmer") {
    width = 512;
    height = 580;
  }
  if (mode === "rpn") height += 100;

  const win = new BrowserWindow({
    width,
    height,
    resizable: false,
    icon: appIcon,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  win.loadFile("index.html");
  if (!mainWin) {
    mainWin = win;
    buildMenu();
  }
  return win;
}

let aboutWin;
function showAbout() {
  if (aboutWin && !aboutWin.isDestroyed()) return aboutWin.focus();
  aboutWin = new BrowserWindow({
    width: 320,
    height: 420,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWin,
    modal: true,
    icon: appIcon,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  aboutWin.setMenuBarVisibility(false);
  aboutWin.loadFile("about.html");
  aboutWin.once("ready-to-show", () => {
    if (mainWin && !mainWin.isDestroyed()) {
      const [px, py] = mainWin.getPosition();
      const [pw, ph] = mainWin.getSize();
      const [w, h] = aboutWin.getSize();
      aboutWin.setPosition(Math.round(px + (pw - w) / 2), Math.round(py + (ph - h) / 2));
    }
    aboutWin.show();
  });
  aboutWin.webContents.once("did-finish-load", () => {
    aboutWin.webContents.send("icon-path", path.join(__dirname, "app_icon.png"));
    aboutWin.webContents.send("app-version", require("./package.json").version);
    const { licenseKey, userName } = load();
    if (isValidLicense(licenseKey, userName)) aboutWin.webContents.send("licensed");
  });
  ipcMain.handleOnce("close-about", () => aboutWin?.close());
  aboutWin.on("closed", () => { aboutWin = null; });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const settings = load();
  const currentMode = settings.mode || "algebraic";
  const currentLayout = settings.layout || "scientific";
  const currentPrecision = settings.precision !== undefined ? settings.precision : -1;
  const currentDisplay = settings.displayFormat || "auto";

  const template = [
    {
      label: app.name,
      submenu: [
        { label: "About BengalCalc", click: showAbout },
        { type: "separator" },
        { label: "Settings…", click: openSettings },
        { label: "License Key…", click: openLicense },
        { type: "separator" },
        ...(isMac ? [
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
        ] : []),
        { role: "quit" }
      ]
    },
    {
      label: "View",
      submenu: [
        {
          label: "Mode",
          submenu: [
            {
              label: "Algebraic",
              type: "radio",
              checked: currentMode === "algebraic",
              click: () => setCalcMode("algebraic"),
            },
            {
              label: "RPN",
              type: "radio",
              checked: currentMode === "rpn",
              click: () => setCalcMode("rpn"),
            },
          ]
        },
        {
          label: "Layout",
          submenu: [
            {
              label: "Scientific",
              type: "radio",
              checked: currentLayout === "scientific",
              click: () => setCalcLayout("scientific"),
            },
            {
              label: "Programmer",
              type: "radio",
              checked: currentLayout === "programmer",
              click: () => setCalcLayout("programmer"),
            },
          ]
        },
        {
          label: "Precision",
          submenu: Array.from({ length: 16 }, (_, i) => ({
            label: String(i),
            type: "radio",
            checked: currentPrecision === i,
            click: () => setCalcPrecision(i),
          }))
        },
        {
          label: "Display",
          submenu: [
            { label: "Auto", type: "radio", checked: currentDisplay === "auto", click: () => setCalcDisplay("auto") },
            { label: "Engineering", type: "radio", checked: currentDisplay === "engineering", click: () => setCalcDisplay("engineering") },
            { label: "Fixed", type: "radio", checked: currentDisplay === "fixed", click: () => setCalcDisplay("fixed") },
            { label: "Scientific", type: "radio", checked: currentDisplay === "scientific", click: () => setCalcDisplay("scientific") },
          ]
        },
        { type: "separator" },
        { role: "close" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Cut",
          accelerator: "CmdOrCtrl+X",
          click: () => mainWin?.webContents.send("edit-cut"),
        },
        {
          label: "Copy",
          accelerator: "CmdOrCtrl+C",
          click: () => mainWin?.webContents.send("edit-copy"),
        },
        {
          label: "Paste",
          accelerator: "CmdOrCtrl+V",
          click: () => mainWin?.webContents.send("edit-paste"),
        },
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        ...(isMac ? [{ role: "zoom" }] : []),
        { type: "separator" },
        {
          label: "Toggle Developer Tools",
          accelerator: isMac ? "Cmd+Option+I" : "Ctrl+Shift+I",
          click: () => BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools()
        },
        ...(isMac ? [
          { type: "separator" },
          { role: "front" },
        ] : []),
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setCalcMode(mode) {
  const settings = load();
  settings.mode = mode;
  save(settings);
  resizeForSettings(mode, settings.layout || "scientific");
  mainWin?.webContents.send("set-mode", mode);
  buildMenu();
}

function setCalcLayout(layout) {
  const settings = load();
  settings.layout = layout;
  save(settings);
  resizeForSettings(settings.mode || "algebraic", layout);
  mainWin?.webContents.send("set-layout", layout);
  buildMenu();
}

function setCalcPrecision(precision) {
  const settings = load();
  settings.precision = precision;
  save(settings);
  mainWin?.webContents.send("set-precision", precision);
  buildMenu();
}

function setCalcDisplay(format) {
  const settings = load();
  settings.displayFormat = format;
  save(settings);
  mainWin?.webContents.send("set-display-format", format);
  buildMenu();
}

function resizeForSettings(mode, layout) {
  if (!mainWin) return;
  let width, height;
  if (layout === "programmer") {
    width = 512;
    height = 580;
  } else {
    width = 640;
    height = 420;
  }
  if (mode === "rpn") height += 100;
  mainWin.setResizable(false);
  mainWin.setAspectRatio(0);
  mainWin.setSize(width, height);
}

ipcMain.handle("get-calc-settings", () => {
  const settings = load();
  return { mode: settings.mode || "algebraic", layout: settings.layout || "scientific", precision: settings.precision !== undefined ? settings.precision : -1, displayFormat: settings.displayFormat || "auto" };
});

let licenseWin;

function openLicense() {
  if (licenseWin) return licenseWin.focus();
  licenseWin = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: false,
    parent: mainWin,
    modal: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  licenseWin.setMenuBarVisibility(false);
  licenseWin.loadFile("license_dialog.html");
  licenseWin.webContents.once("did-finish-load", () => {
    const { licenseKey, userName } = load();
    licenseWin.webContents.send("license-data", { key: licenseKey || "", userName: userName || "" });
  });
  licenseWin.on("closed", () => { licenseWin = null; });
}

ipcMain.handle("license-save", (_e, { key, userName }) => {
  if (!isValidLicense(key, userName)) return;
  const settings = load();
  settings.licenseKey = key.toUpperCase();
  settings.userName = userName;
  save(settings);
  licenseWin?.close();
});

ipcMain.handle("license-cancel", () => licenseWin?.close());

function openSettings() {
  if (settingsWin) return settingsWin.focus();
  settingsWin = new BrowserWindow({
    width: 400,
    height: 380,
    resizable: false,
    parent: mainWin,
    modal: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile("settings.html");
  settingsWin.on("closed", () => { settingsWin = null; });
}

ipcMain.handle("settings-get-data", () => ({ settings: load() }));

ipcMain.handle("settings-save", (_e, newSettings) => {
  const existing = load();
  save({ ...existing, ...newSettings });
  settingsWin?.close();
  mainWin?.webContents.send("settings-updated");
});

ipcMain.handle("get-colors", () => {
  const settings = load();
  return { fontColor: settings.fontColor || "", bgColor: settings.bgColor || "", btnColor: settings.btnColor || "" };
});

ipcMain.handle("settings-cancel", () => settingsWin?.close());

ipcMain.handle("open-external", (_e, url) => openExternal(url));

function showSplash(nagOnly) {
  const splash = new BrowserWindow({
    width: 320,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    icon: appIcon,
    parent: nagOnly ? mainWin : undefined,
    modal: !!nagOnly,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  splash.loadFile("splash.html");
  splash.webContents.once("did-finish-load", () => {
    splash.webContents.send("icon-path", path.join(__dirname, "app_icon.png"));
    splash.webContents.send("app-version", require("./package.json").version);
  });

  const handler = () => {
    if (!splash.isDestroyed()) splash.close();
    if (!nagOnly) createWindow();
  };
  ipcMain.once("splash-close", handler);
  splash.on("closed", () => ipcMain.removeListener("splash-close", handler));
}

app.whenReady().then(() => {
  const { licenseKey, userName } = load();
  if (isValidLicense(licenseKey, userName)) {
    createWindow();
  } else {
    showSplash();
  }
});
