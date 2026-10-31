REPU - WebGL build
==================

HOW TO PLAY
-----------
1. Double-click "Play REPU.bat".
2. Your browser opens at http://localhost:8099 and the game loads.

If Windows blocks the .bat, open a terminal in this folder and run:
    node serve.js
then open http://localhost:8099

CONTROLS
--------
Click the game once to capture the mouse, so looking around does not stop at
the edge of the browser window. Esc releases it (and opens the pause menu).
The mouse is released automatically whenever a menu is open, so menus are
clicked normally.

WHY A SERVER
------------
Browsers refuse to run WebGL builds from file:// (the engine needs HTTP to
fetch its data and wasm). serve.js is a small Node server that only reads
files from this folder.

SPLIT PAYLOAD
-------------
The game data is far too large for hosts that cap single uploads, so every
file over 3 MB is stored as 3 MB parts in Build/chunks/<name>/ and the
original is gone. sw.js puts them back together: it opens the parts in order,
decompresses the stream as it goes and hands Unity one continuous response.
Nothing is buffered, so this costs no extra memory.

That worker needs http://localhost or https. Always start the game through
"Play REPU.bat" or a web server, never by double-clicking index.html.

WHAT IS IN HERE
---------------
index.html            page shell (canvas fills the tab, wires up the worker)
chunk-loader.js       waits for the worker, resizes the canvas with the window
sw.js                 reassembles Build/chunks/ into streamed responses
Build/123.loader.js   bootstrap
Build/chunks/         game data and wasm, split into 3 MB parts
StreamingAssets/      localization files + addressable bundles
TemplateData/         loading screen art
serve.js              local web server
Play REPU.bat         launcher (starts the server and opens the browser)

The very first load streams ~405 MB gzipped; the browser caches it, so later
loads are much faster.

NOTES
-----
* Single player, saves, cosmetics and the pause menu work offline.
* Online/multiplayer is not available in the browser build.
* Addressable localization bundles are Windows-only, so the game reads its
  strings from Resources/LocalizationFallback.json instead.
* Tutorial videos are skipped: the WebGL player cannot read embedded
  VideoClips. Tutorial text still appears.
* Settings and saves live in the browser's IndexedDB for this origin. Clearing
  site data wipes them.
