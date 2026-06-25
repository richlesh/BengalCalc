# BengalCalc — Product Overview

## Purpose
BengalCalc is a bare-bones cross-platform desktop application template built with Electron. It provides the scaffolding for a new app with settings persistence, license key validation, splash screen, and about window already wired up.

## Version
1.0.0

## Key Features

### Settings Window
- Save/load settings to `~/.bengalcalc-settings.json`
- Ready for app-specific settings to be added

### License Key Validation
- HMAC-SHA256 based license key system
- License key entry window
- Splash screen nag for unlicensed users
- Python utility for generating keys

### Splash Screen
- Displays on launch for unlicensed users
- Donation link to Glowing Cat Software
- Auto-dismisses after 20 seconds or on click

### About Window
- Shows app version, Electron version, credits
- Links to website and GitHub issues
- Shows "thank you" message for licensed users

### Build & Distribution
- macOS, Windows, and Linux builds via electron-builder
- GitHub Actions workflows for all platforms
- macOS code signing and notarization support

## Target Users
Developers who want a ready-made Electron app skeleton with common features (settings, licensing, splash, about) already implemented.
