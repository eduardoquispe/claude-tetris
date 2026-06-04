# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Vanilla JS/HTML5/CSS3. No build step, no package manager, no dependencies.

## Run locally

```bash
python3 -m http.server 8000
# or: open index.html
```

## Key gotcha

`COLS`, `ROWS`, `BLOCK` in `game.js` are tightly coupled to canvas pixel dimensions in `index.html`. Changing any of them requires updating both files consistently.

## Code style

ES6+, `'use strict'`, `const`/`let` only. Procedural game loop via `requestAnimationFrame`. Board = 2D array: `0` empty, `1–7` color index.
