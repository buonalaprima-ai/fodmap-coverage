#!/usr/bin/env bash
# Cache-busting deploy stamp.
# Mette ?v=<versione> su OGNI URL di modulo (script tag + import interni) e
# sincronizza window.APP_VERSION con version.json. Da eseguire prima di ogni deploy:
# i browser/CDN cachano i .js per URL, quindi senza il query i moduli restano vecchi
# anche dopo l'aggiornamento (era la causa dei verdetti "stale").
set -euo pipefail
cd "$(dirname "$0")"
VER="$(python3 -c "import json;print(json.load(open('version.json'))['version'])")"
echo "stamping versione: $VER"

# index.html: cache-bust di src/main.js + APP_VERSION allineato
sed -i '' -E "s#(src=\"src/main\.js)(\?v=[^\"]*)?\"#\1?v=$VER\"#" index.html
sed -i '' -E "s#(window\.APP_VERSION = \")[^\"]*(\";)#\1$VER\2#" index.html

# src/*.js: cache-bust di tutti gli import interni relativi
for f in src/*.js; do
  sed -i '' -E "s#from \"(\./[A-Za-z0-9_./-]+\.js)(\?v=[^\"]*)?\"#from \"\1?v=$VER\"#g" "$f"
done

echo "fatto. Riferimenti versionati:"
grep -n 'main.js?v=' index.html || true
grep -rn 'from "\./.*?v=' src/*.js | head
