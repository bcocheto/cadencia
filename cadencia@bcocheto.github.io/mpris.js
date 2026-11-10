import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

// O XML MPRIS que o shell carrega não traz Volume, Shuffle, LoopStatus, Seek nem SetPosition;
// declaramos aqui só o que a extensão usa.
const MprisProxy = Gio.DBusProxy.makeProxyWrapper(`
<node><interface name="org.mpris.MediaPlayer2">
  <method name="Raise"/>
  <property name="CanRaise" type="b" access="read"/>
  <property name="Identity" type="s" access="read"/>
  <property name="DesktopEntry" type="s" access="read"/>
</interface></node>`);
const PlayerProxy = Gio.DBusProxy.makeProxyWrapper(`
<node><interface name="org.mpris.MediaPlayer2.Player">
  <method name="PlayPause"/>
  <method name="Next"/>
  <method name="Previous"/>
  <method name="Seek"><arg type="x" direction="in"/></method>
  <method name="SetPosition"><arg type="o" direction="in"/><arg type="x" direction="in"/></method>
  <property name="PlaybackStatus" type="s" access="read"/>
  <property name="LoopStatus" type="s" access="readwrite"/>
  <property name="Shuffle" type="b" access="readwrite"/>
  <property name="Volume" type="d" access="readwrite"/>
  <property name="Metadata" type="a{sv}" access="read"/>
  <property name="CanGoNext" type="b" access="read"/>
  <property name="CanGoPrevious" type="b" access="read"/>
  <property name="CanPlay" type="b" access="read"/>
  <property name="CanSeek" type="b" access="read"/>
</interface></node>`);

const PREFIX = 'org.mpris.MediaPlayer2.';
const PATH = '/org/mpris/MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const MAX_LENGTH_US = 864e8; // 24 h; valores maiores costumam ser streams ao vivo

const OBJECT_PATH_RE = /^\/([A-Za-z0-9_]+(\/[A-Za-z0-9_]+)*)?$/;

const str = v => (typeof v === 'string' ? v : '');

export const Player = GObject.registerClass({
    Signals: {'changed': {}},
}, class CadenciaPlayer extends GObject.Object {
    _init(busName) {
        super._init();
        this.busName = busName;
        this.ready = false;
        this.lastActive = 0;

        this.identity = busName.slice(PREFIX.length);
        this.desktopEntry = '';
        this.status = 'Stopped';
        this.title = '';
        this.artist = '';
        this.album = '';
        this.artUrl = '';
        this.trackId = '';
        this.length = 0; // µs
        this.canNext = false;
        this.canPrev = false;
        this.canPlay = true;
        this.canSeek = false;
        this.volume = 1;
        this.hasVolume = false;
        this.shuffle = null;
        this.loop = null;

        this._dead = false;
        this._sig = '';
        this._lastPos = 0;
        this._posBusy = false;
        this._cancellable = new Gio.Cancellable();

        this._mpris = new MprisProxy(Gio.DBus.session, busName, PATH, (_p, error) => {
            if (!this._dead && !error && this.ready)
                this._refresh();
        });
        this._player = new PlayerProxy(Gio.DBus.session, busName, PATH, (_p, error) => {
            if (this._dead || error)
                return;
            this._player.connectObject('g-properties-changed', () => this._refresh(), this);
            this.ready = true;
            this._refresh();
        });
    }

    _refresh() {
        const p = this._player;
        if (this._dead || !p)
            return;

        const md = {};
        for (const k of Object.keys(p.Metadata ?? {})) {
            try {
                md[k] = p.Metadata[k].deepUnpack();
            } catch (_e) {
                // chave malformada: ignora só ela
            }
        }

        const wasPlaying = this.playing;
        this.identity = str(this._mpris?.Identity) || this.identity;
        this.desktopEntry = str(this._mpris?.DesktopEntry);
        this.status = str(p.PlaybackStatus) || 'Stopped';
        this.title = str(md['xesam:title']);
        this.artist = Array.isArray(md['xesam:artist'])
            ? md['xesam:artist'].filter(a => typeof a === 'string').join(', ')
            : str(md['xesam:artist']);
        this.album = str(md['xesam:album']);
        this.artUrl = str(md['mpris:artUrl']);
        this.trackId = str(md['mpris:trackid']);
        const len = Number(md['mpris:length']);
        this.length = len > 0 && len < MAX_LENGTH_US ? len : 0;
        this.canNext = !!p.CanGoNext;
        this.canPrev = !!p.CanGoPrevious;
        this.canPlay = p.CanPlay !== false;
        this.canSeek = !!p.CanSeek;
        this.hasVolume = typeof p.Volume === 'number' && Number.isFinite(p.Volume);
        this.volume = this.hasVolume ? Math.max(0, p.Volume) : 1;
        this.shuffle = typeof p.Shuffle === 'boolean' ? p.Shuffle : null;
        this.loop = typeof p.LoopStatus === 'string' ? p.LoopStatus : null;

        // só a transição para "tocando" conta: eventos de um player em segundo plano
        // não devem tirá-lo da vez de quem está tocando de fato
        if (this.playing && !wasPlaying)
            this.lastActive = GLib.get_monotonic_time();

        const sig = [this.status, this.identity, this.title, this.artist, this.album, this.artUrl,
            this.trackId, this.length, this.canNext, this.canPrev, this.canPlay, this.canSeek,
            this.volume, this.shuffle, this.loop].join('\u0001');
        if (sig === this._sig)
            return;
        this._sig = sig;
        this.emit('changed');
    }

    get playing() {
        return this.status === 'Playing';
    }

    playPause() { this._player?.PlayPauseAsync().catch(e => console.error(e)); }
    next() { this._player?.NextAsync().catch(e => console.error(e)); }
    previous() { this._player?.PreviousAsync().catch(e => console.error(e)); }

    raise() {
        if (this._mpris?.CanRaise)
            this._mpris.RaiseAsync().catch(e => console.error(e));
    }

    setVolume(v) {
        if (this.hasVolume && this._player && Number.isFinite(v)) {
            this.volume = Math.max(0, v);
            this._player.Volume = this.volume;
        }
    }

    toggleShuffle() {
        if (this._player && this.shuffle !== null)
            this._player.Shuffle = !this.shuffle;
    }

    cycleLoop() {
        const order = ['None', 'Playlist', 'Track'];
        if (this._player && this.loop !== null)
            this._player.LoopStatus = order[(order.indexOf(this.loop) + 1) % order.length];
    }

    seekTo(us) {
        if (!this.canSeek || !this._player)
            return;
        const target = Math.round(us);
        const offset = target - this._lastPos;
        this._lastPos = target;

        // SetPosition exige um trackid válido; sem ele (ou se falhar) usamos Seek relativo
        const usable = OBJECT_PATH_RE.test(this.trackId) && !this.trackId.endsWith('/NoTrack');
        if (usable) {
            this._player.SetPositionAsync(this.trackId, target)
                .catch(() => this._player?.SeekAsync(offset).catch(e => console.error(e)));
        } else {
            this._player.SeekAsync(offset).catch(e => console.error(e));
        }
    }

    // Position não emite sinal de mudança: consultamos sob demanda
    getPosition() {
        if (this._dead || this._posBusy)
            return Promise.resolve(null);
        this._posBusy = true;
        return new Promise(resolve => {
            Gio.DBus.session.call(
                this.busName, PATH, 'org.freedesktop.DBus.Properties', 'Get',
                new GLib.Variant('(ss)', [PLAYER_IFACE, 'Position']),
                new GLib.VariantType('(v)'), Gio.DBusCallFlags.NONE, 500, this._cancellable,
                (conn, res) => {
                    this._posBusy = false;
                    try {
                        const value = Number(conn.call_finish(res).get_child_value(0).get_variant().deepUnpack());
                        if (Number.isFinite(value))
                            this._lastPos = value;
                        resolve(Number.isFinite(value) ? value : null);
                    } catch (_e) {
                        resolve(null);
                    }
                });
        });
    }

    destroy() {
        this._dead = true;
        this._cancellable.cancel();
        this._player?.disconnectObject(this);
        this._player = null;
        this._mpris = null;
    }
});

export const Manager = GObject.registerClass({
    Signals: {'changed': {}},
}, class CadenciaManager extends GObject.Object {
    _init() {
        super._init();
        this._players = new Map();
        this._pinned = null;
        this._cache = null;
        this._cancellable = new Gio.Cancellable();

        // assina antes de listar, para não perder um player que surge no intervalo;
        // o filtro por prefixo roda no daemon do D-Bus, sem acordar o shell à toa
        this._sub = Gio.DBus.session.signal_subscribe(
            'org.freedesktop.DBus', 'org.freedesktop.DBus', 'NameOwnerChanged',
            '/org/freedesktop/DBus', 'org.mpris.MediaPlayer2',
            Gio.DBusSignalFlags.MATCH_ARG0_NAMESPACE,
            (_c, _s, _p, _i, _n, params) => {
                const [name, oldOwner, newOwner] = params.deepUnpack();
                if (oldOwner)
                    this._remove(name);
                if (newOwner)
                    this._add(name);
            });

        Gio.DBus.session.call(
            'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames',
            null, new GLib.VariantType('(as)'), Gio.DBusCallFlags.NONE, -1, this._cancellable,
            (conn, res) => {
                try {
                    const [names] = conn.call_finish(res).deepUnpack();
                    names.forEach(n => this._add(n));
                } catch (e) {
                    if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        console.error(e);
                }
            });
    }

    _add(name) {
        // playerctld só espelha o player corrente; seria um chip duplicado
        if (!name.startsWith(PREFIX) || name.endsWith('.playerctld') || this._players.has(name))
            return;
        const player = new Player(name);
        player.connectObject('changed', () => this._changed(), this);
        this._players.set(name, player);
        this._changed();
    }

    _remove(name) {
        const player = this._players.get(name);
        if (!player)
            return;
        this._players.delete(name);
        if (this._pinned === name)
            this._pinned = null;
        player.disconnectObject(this);
        player.destroy();
        this._changed();
    }

    _changed() {
        this._cache = null;
        this.emit('changed');
    }

    _resolve() {
        if (this._cache)
            return this._cache;
        const list = [...this._players.values()]
            .filter(p => p.ready)
            .sort((a, b) => a.busName.localeCompare(b.busName));
        let current = list.find(p => p.busName === this._pinned) ?? null;
        if (!current && list.length) {
            const byRecent = [...list].sort((a, b) => b.lastActive - a.lastActive);
            current = byRecent.find(p => p.playing) ?? byRecent[0];
        }
        this._cache = {list, current};
        return this._cache;
    }

    get players() {
        return this._resolve().list;
    }

    get current() {
        return this._resolve().current;
    }

    pin(player) {
        this._pinned = player?.busName ?? null;
        this._changed();
    }

    destroy() {
        this._cancellable.cancel();
        if (this._sub) {
            Gio.DBus.session.signal_unsubscribe(this._sub);
            this._sub = 0;
        }
        for (const name of [...this._players.keys()])
            this._remove(name);
    }
});
