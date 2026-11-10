#!/bin/bash
# Abre um shell GNOME sem tela com a extensão, players falsos e tira uma captura do popup.
# A extensão é copiada para um XDG_DATA_HOME temporário e recebe um gancho de teste só na cópia.
# uso: tools/headless-shot.sh <saida.png> [duo|solo|pause|cover|block|green]
set -e
OUT=$(realpath -m "$1"); MODE=${2:-duo}
ROOT=$(cd "$(dirname "$0")/.." && pwd); UUID=cadencia@bcocheto.github.io
TMP=$(mktemp -d); export XDG_CONFIG_HOME=$TMP/config XDG_DATA_HOME=$TMP/data CADENCIA_DEBUG=$OUT
mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions"
cp -r "$ROOT/$UUID" "$XDG_DATA_HOME/gnome-shell/extensions/$UUID"
glib-compile-schemas "$XDG_DATA_HOME/gnome-shell/extensions/$UUID/schemas"
python3 - "$XDG_DATA_HOME/gnome-shell/extensions/$UUID/extension.js" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace("import St from 'gi://St';", "import St from 'gi://St';\nimport GLib from 'gi://GLib';\nimport Gio from 'gi://Gio';", 1)
s = s.replace("        this._mount();\n    }\n\n    _mount", """        this._mount();
        const out = GLib.getenv('CADENCIA_DEBUG');
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
            this._indicator.menu.open(false);
            console.log('CADENCIA n=' + this._manager.players.length + ' cur=' + this._manager.current?.busName);
            GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
                const shot = new Shell.Screenshot();
                const stream = Gio.File.new_for_path(out).replace(null, false, Gio.FileCreateFlags.NONE, null);
                shot.screenshot(false, stream, (s, res) => { s.screenshot_finish(res); stream.close(null); });
                return GLib.SOURCE_REMOVE;
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    _mount""", 1)
open(p, 'w').write(s)
PY
T=$ROOT/tools; SD=$XDG_DATA_HOME/gnome-shell/extensions/$UUID/schemas
SP="python3 $T/fake_player.py spotify 'Midnight Drive' file://$T/cover.png Playing 'Aurora Lines' 'Neon Skyline' &"
FF="python3 $T/fake_player.py firefox 'Vídeo no navegador' '' Paused &"
case $MODE in
  duo|cover|block|green) P="$SP $FF";; solo) P="$SP";; pause) P="python3 $T/fake_player.py spotify 'Midnight Drive' file://$T/cover.png Paused 'Aurora Lines' 'Neon Skyline' &";;
esac
case $MODE in
  cover) X="GSETTINGS_SCHEMA_DIR=$SD gsettings set org.gnome.shell.extensions.cadencia cover-layout true";;
  block) X="GSETTINGS_SCHEMA_DIR=$SD gsettings set org.gnome.shell.extensions.cadencia blocked-players \"['firefox']\"";;
  green) X="gsettings set org.gnome.desktop.interface accent-color green";;
  *) X=true;;
esac
dbus-run-session -- bash -c "
$P
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell enabled-extensions \"['$UUID']\"
$X
timeout 18 gnome-shell --headless --wayland --virtual-monitor 1280x720 2>&1 | grep -i 'CADENCIA\|JS ERROR\|TypeError\|Exception' | head -20
"
