import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {loadInterfaceXML} from 'resource:///org/gnome/shell/misc/fileUtils.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');

const DBusProxy = Gio.DBusProxy.makeProxyWrapper(loadInterfaceXML('org.freedesktop.DBus'));
// o XML do shell não traz Volume, Shuffle, LoopStatus nem SetPosition; declaramos o necessário
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

        this._mpris = new MprisProxy(Gio.DBus.session, busName, PATH, () => this._refresh());
        this._player = new PlayerProxy(Gio.DBus.session, busName, PATH, () => this._onPlayerReady());
    }

    _onPlayerReady() {
        this._player.connectObject('g-properties-changed', () => this._refresh(), this);
        this.ready = true;
        this._refresh();
    }

    _refresh() {
        const p = this._player;
        const md = {};
        try {
            for (const k in (p.Metadata ?? {}))
                md[k] = p.Metadata[k].deepUnpack();
        } catch (e) {
            logError(e);
        }

        this.identity = str(this._mpris.Identity) || this.identity;
        this.desktopEntry = str(this._mpris.DesktopEntry);
        this.status = str(p.PlaybackStatus) || 'Stopped';
        this.title = str(md['xesam:title']);
        this.artist = Array.isArray(md['xesam:artist']) ? md['xesam:artist'].filter(a => typeof a === 'string').join(', ') : str(md['xesam:artist']);
        this.album = str(md['xesam:album']);
        this.artUrl = str(md['mpris:artUrl']);
        this.trackId = str(md['mpris:trackid']);
        this.length = Number(md['mpris:length'] ?? 0) || 0;
        this.canNext = !!p.CanGoNext;
        this.canPrev = !!p.CanGoPrevious;
        this.canPlay = p.CanPlay !== false;
        this.canSeek = !!p.CanSeek;
        this.hasVolume = typeof p.Volume === 'number';
        this.volume = this.hasVolume ? Math.max(0, p.Volume) : 1;
        this.shuffle = typeof p.Shuffle === 'boolean' ? p.Shuffle : null;
        this.loop = typeof p.LoopStatus === 'string' ? p.LoopStatus : null;

        if (this.status === 'Playing')
            this.lastActive = GLib.get_monotonic_time();
        this.emit('changed');
    }

    get playing() {
        return this.status === 'Playing';
    }

    playPause() { this._player.PlayPauseAsync().catch(logError); }
    next() { this._player.NextAsync().catch(logError); }
    previous() { this._player.PreviousAsync().catch(logError); }

    raise() {
        if (this._mpris.CanRaise)
            this._mpris.RaiseAsync().catch(logError);
    }

    setVolume(v) {
        if (this.hasVolume) {
            this.volume = Math.max(0, v);
            this._player.Volume = this.volume;
        }
    }

    toggleShuffle() {
        if (this.shuffle !== null)
            this._player.Shuffle = !this.shuffle;
    }

    cycleLoop() {
        const order = ['None', 'Playlist', 'Track'];
        if (this.loop !== null)
            this._player.LoopStatus = order[(order.indexOf(this.loop) + 1) % order.length];
    }

    seekTo(us) {
        if (!this.canSeek)
            return;
        if (this.trackId.startsWith('/'))
            this._player.SetPositionAsync(this.trackId, Math.round(us)).catch(logError);
    }

    async getPosition() {
        try {
            const res = await Gio.DBus.session.call(
                this.busName, PATH, 'org.freedesktop.DBus.Properties', 'Get',
                new GLib.Variant('(ss)', [PLAYER_IFACE, 'Position']),
                new GLib.VariantType('(v)'), Gio.DBusCallFlags.NONE, 500, null);
            return Number(res.get_child_value(0).get_variant().get_int64());
        } catch (_e) {
            return null;
        }
    }

    destroy() {
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
        this._destroyed = false;
        this._dbus = new DBusProxy(Gio.DBus.session, 'org.freedesktop.DBus',
            '/org/freedesktop/DBus', () => this._onReady());
    }

    async _onReady() {
        if (this._destroyed)
            return;
        try {
            const [names] = await this._dbus.ListNamesAsync();
            if (this._destroyed)
                return;
            names.filter(n => n.startsWith(PREFIX)).forEach(n => this._add(n));
        } catch (e) {
            logError(e);
        }
        this._dbus.connectSignal('NameOwnerChanged', (_p, _s, [name, oldOwner, newOwner]) => {
            if (!name.startsWith(PREFIX))
                return;
            if (oldOwner)
                this._remove(name);
            if (newOwner)
                this._add(name);
        });
    }

    _add(name) {
        if (this._players.has(name))
            return;
        const player = new Player(name);
        player.connectObject('changed', () => this.emit('changed'), this);
        this._players.set(name, player);
        this.emit('changed');
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
        this.emit('changed');
    }

    get players() {
        return [...this._players.values()].filter(p => p.ready).sort((a, b) => a.busName.localeCompare(b.busName));
    }

    get current() {
        const list = this.players;
        if (!list.length)
            return null;
        const pinned = list.find(p => p.busName === this._pinned);
        if (pinned)
            return pinned;
        const playing = list.filter(p => p.playing).sort((a, b) => b.lastActive - a.lastActive);
        if (playing.length)
            return playing[0];
        return [...list].sort((a, b) => b.lastActive - a.lastActive)[0];
    }

    pin(player) {
        this._pinned = player?.busName ?? null;
        this.emit('changed');
    }

    destroy() {
        this._destroyed = true;
        for (const name of [...this._players.keys()])
            this._remove(name);
        this._dbus = null;
    }
});
