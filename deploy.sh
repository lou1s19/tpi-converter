#!/bin/bash
# ============================================================
# deploy.sh – Sauberes Deployment für Plesk
# ============================================================
# Dieses Script kopiert NUR produktionsrelevante Dateien
# in ein frisches Zielverzeichnis. Das Zielverzeichnis wird
# vorher KOMPLETT geleert, sodass keine alten/kompromittierten
# Dateien zurückbleiben.
#
# Verwendung:
#   ./deploy.sh /var/www/vhosts/deine-domain.de/httpdocs
#
# ACHTUNG: Das Zielverzeichnis wird GELÖSCHT und neu erstellt!
# ============================================================

set -euo pipefail

# --- Konfiguration ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${1:-}"

if [ -z "$TARGET_DIR" ]; then
    echo "❌ Fehler: Kein Zielverzeichnis angegeben."
    echo ""
    echo "Verwendung: $0 /pfad/zum/zielverzeichnis"
    echo "Beispiel:   $0 /var/www/vhosts/deine-domain.de/httpdocs"
    exit 1
fi

# Sicherheitsabfrage
echo "⚠️  ACHTUNG: Das Verzeichnis '$TARGET_DIR' wird KOMPLETT GELÖSCHT und neu erstellt!"
echo ""
read -p "Bist du sicher? (ja/nein): " CONFIRM
if [ "$CONFIRM" != "ja" ]; then
    echo "Abgebrochen."
    exit 0
fi

echo ""
echo "🧹 Schritt 1: Zielverzeichnis leerputzen..."
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

echo "📦 Schritt 2: Produktionsdateien kopieren..."

# Verzeichnisse kopieren (nur produktionsrelevante)
for dir in bilder css js vendor contact help webp-converter; do
    if [ -d "$SCRIPT_DIR/$dir" ]; then
        cp -r "$SCRIPT_DIR/$dir" "$TARGET_DIR/$dir"
        echo "   ✓ $dir/"
    fi
done

# Einzelne Dateien kopieren
for file in index.html .htaccess; do
    if [ -f "$SCRIPT_DIR/$file" ]; then
        cp "$SCRIPT_DIR/$file" "$TARGET_DIR/$file"
        echo "   ✓ $file"
    fi
done

echo ""
echo "🔒 Schritt 3: Berechtigungen setzen..."
find "$TARGET_DIR" -type d -exec chmod 755 {} \;
find "$TARGET_DIR" -type f -exec chmod 644 {} \;

echo ""
echo "✅ Deployment abgeschlossen!"
echo "   Ziel: $TARGET_DIR"
echo ""
echo "📋 Checkliste nach dem Deployment:"
echo "   1. Website im Browser prüfen"
echo "   2. Security-Header testen: curl -I https://deine-domain.de"
echo "   3. HSTS in .htaccess aktivieren (wenn HTTPS bestätigt)"
echo "   4. Bilder hochladen und konvertieren testen"
