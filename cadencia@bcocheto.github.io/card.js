import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';

function fmt(us) {
    const s = Math.max(0, Math.floor(us / 1e6));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function iconButton(icon, styleClass, onClick, accessibleName) {
    const btn = new St.Button({
        style_class: `cadencia-btn ${styleClass}`,
        can_focus: true,
        reactive: true,
        track_hover: true,
        accessible_name: accessibleName,
        child: new St.Icon({icon_name: icon}),
    });
    btn.connect('clicked', onClick);
    return btn;
}

function label(styleClass) {
    const l = new St.Label({style_class: styleClass, x_align: Clutter.ActorAlign.START});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}

// Corpo do popup: players, capa, faixa, progresso, controles e volume (visual do Gavetta)
export const MediaCard = GObject.registerClass({
    Signals: {'raise': {}},
}, class CadenciaCard extends St.BoxLayout {
    _init(manager, art) {
        super._init({style_class: 'cadencia-popup', vertical: true});
        this._manager = manager;
        this._art = art;
        this._player = null;
        this._artKey = null;
        this._active = false;
        this._dragging = false;
        this._updating = false;
        this._position = 0;
        this._tick = 0;

        this._chips = new St.BoxLayout({style_class: 'cadencia-chips'});
        this.add_child(this._chips);

        // ── faixa atual ──
        this._track = new St.BoxLayout({style_class: 'cadencia-track'});
        this._artBin = new St.Button({
            style_class: 'cadencia-art', can_focus: true, reactive: true,
            accessible_name: 'Abrir o player',
            child: new St.Icon({icon_name: 'audio-x-generic-symbolic', style_class: 'cadencia-art-icon'}),
        });
        this._artBin.connect('clicked', () => this.emit('raise'));
        this._track.add_child(this._artBin);

        const info = new St.BoxLayout({vertical: true, y_align: Clutter.ActorAlign.CENTER, x_expand: true, style_class: 'cadencia-info'});
        this._source = label('cadencia-source');
        this._title = new St.Label({style_class: 'cadencia-title', x_align: Clutter.ActorAlign.START});
        this._title.clutter_text.line_wrapping = true;
        this._title.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._artist = label('cadencia-artist');
        this._album = label('cadencia-meta');
        info.add_child(this._source);
        info.add_child(this._title);
        info.add_child(this._artist);
        info.add_child(this._album);
        this._track.add_child(info);
        this.add_child(this._track);

        // ── progresso ──
        this._progress = new St.BoxLayout({vertical: true, style_class: 'cadencia-progress'});
        this._seek = new Slider(0);
        this._seek.add_style_class_name('cadencia-slider');
        this._seek.connect('drag-begin', () => (this._dragging = true));
        this._seek.connect('drag-end', () => {
            this._dragging = false;
            this._seekFromSlider();
        });
        this._seek.connect('notify::value', () => {
            if (this._updating)
                return;
            if (this._dragging)
                this._posLabel.text = fmt(this._seek.value * (this._player?.length ?? 0));
            else
                this._seekFromSlider();
        });
        const times = new St.BoxLayout({style_class: 'cadencia-times'});
        this._posLabel = new St.Label({text: '0:00', style_class: 'cadencia-meta', x_expand: true});
        this._durLabel = new St.Label({text: '0:00', style_class: 'cadencia-meta'});
        times.add_child(this._posLabel);
        times.add_child(this._durLabel);
        this._progress.add_child(this._seek);
        this._progress.add_child(times);
        this.add_child(this._progress);

        // ── controles ──
        this._controls = new St.BoxLayout({style_class: 'cadencia-controls', x_align: Clutter.ActorAlign.CENTER});
        this._btnShuffle = iconButton('media-playlist-shuffle-symbolic', 'toggle', () => this._player?.toggleShuffle(), 'Aleatório');
        this._btnPrev = iconButton('media-skip-backward-symbolic', 'skip', () => this._player?.previous(), 'Anterior');
        this._btnPlay = iconButton('media-playback-start-symbolic', 'play', () => this._player?.playPause(), 'Reproduzir ou pausar');
        this._btnNext = iconButton('media-skip-forward-symbolic', 'skip', () => this._player?.next(), 'Próxima');
        this._btnLoop = iconButton('media-playlist-repeat-symbolic', 'toggle', () => this._player?.cycleLoop(), 'Repetir');
        for (const b of [this._btnShuffle, this._btnPrev, this._btnPlay, this._btnNext, this._btnLoop])
            this._controls.add_child(b);
        this.add_child(this._controls);

        // ── volume ──
        this._volRow = new St.BoxLayout({style_class: 'cadencia-volume'});
        this._volIcon = new St.Icon({icon_name: 'audio-volume-high-symbolic', style_class: 'cadencia-vol-icon'});
        this._vol = new Slider(1);
        this._vol.add_style_class_name('cadencia-slider');
        this._vol.x_expand = true;
        this._vol.y_align = Clutter.ActorAlign.CENTER;
        this._vol.connect('notify::value', () => {
            if (this._updating || !this._player)
                return;
            this._player.setVolume(this._vol.value);
            this._syncVolumeIcon();
        });
        this._volRow.add_child(this._volIcon);
        this._volRow.add_child(this._vol);
        this.add_child(this._volRow);

        // ── vazio ──
        this._empty = new St.BoxLayout({vertical: true, style_class: 'cadencia-empty', x_align: Clutter.ActorAlign.CENTER});
        this._empty.add_child(new St.Icon({icon_name: 'audio-headphones-symbolic', x_align: Clutter.ActorAlign.CENTER}));
        this._empty.add_child(new St.Label({text: 'Nada tocando', x_align: Clutter.ActorAlign.CENTER}));
        this._empty.add_child(new St.Label({text: 'Abra um player de mídia para controlá-lo aqui', style_class: 'cadencia-meta', x_align: Clutter.ActorAlign.CENTER}));
        this.add_child(this._empty);

        this._managerId = manager.connect('changed', () => this.rebuild());
        this.rebuild();
    }

    // chamado quando o menu abre/fecha: só consulta a posição enquanto visível
    setActive(active) {
        this._active = active;
        this._stopTick();
        if (active) {
            this._syncPosition();
            this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this._syncPosition();
                return GLib.SOURCE_CONTINUE;
            });
        }
    }

    _stopTick() {
        if (this._tick) {
            GLib.source_remove(this._tick);
            this._tick = 0;
        }
    }

    async _syncPosition() {
        const player = this._player;
        if (!player || this._dragging)
            return;
        const pos = await player.getPosition();
        if (player !== this._player || this._dragging || pos === null)
            return;
        this._position = pos;
        this._renderPosition();
    }

    _renderPosition() {
        const len = this._player?.length ?? 0;
        this._updating = true;
        this._seek.value = len > 0 ? Math.min(1, this._position / len) : 0;
        this._updating = false;
        this._posLabel.text = fmt(this._position);
    }

    _seekFromSlider() {
        const p = this._player;
        if (!p || !p.length)
            return;
        this._position = this._seek.value * p.length;
        p.seekTo(this._position);
        this._posLabel.text = fmt(this._position);
    }

    _syncVolumeIcon() {
        const v = this._vol.value;
        this._volIcon.icon_name = v <= 0 ? 'audio-volume-muted-symbolic'
            : v < 0.34 ? 'audio-volume-low-symbolic'
                : v < 0.67 ? 'audio-volume-medium-symbolic' : 'audio-volume-high-symbolic';
    }

    rebuild() {
        const list = this._manager.players;
        const player = this._manager.current;
        const changedPlayer = player !== this._player;
        this._player = player;

        // chips só com mais de um player
        this._chips.destroy_all_children();
        this._chips.visible = list.length > 1;
        for (const p of list) {
            const chip = new St.Button({
                label: p.identity, can_focus: true, reactive: true, track_hover: true,
                style_class: `cadencia-chip${p === player ? ' active' : ''}`,
            });
            chip.connect('clicked', () => this._manager.pin(p));
            this._chips.add_child(chip);
        }

        const has = !!player;
        for (const w of [this._track, this._progress, this._controls, this._volRow])
            w.visible = has;
        this._empty.visible = !has;
        if (!has)
            return;

        this._source.text = player.identity;
        this._title.text = player.title || 'Sem título';
        this._artist.text = player.artist;
        this._artist.visible = !!player.artist;
        this._album.text = player.album;
        this._album.visible = !!player.album;
        this._durLabel.text = player.length ? fmt(player.length) : '--:--';
        this._seek.reactive = player.canSeek && player.length > 0;
        this._seek.opacity = this._seek.reactive ? 255 : 110;

        this._btnPlay.child.icon_name = player.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._btnPrev.reactive = this._btnPrev.can_focus = player.canPrev;
        this._btnNext.reactive = this._btnNext.can_focus = player.canNext;
        this._btnPrev.opacity = player.canPrev ? 255 : 90;
        this._btnNext.opacity = player.canNext ? 255 : 90;

        this._btnShuffle.visible = player.shuffle !== null;
        this._btnShuffle.remove_style_pseudo_class('checked');
        if (player.shuffle)
            this._btnShuffle.add_style_pseudo_class('checked');
        this._btnLoop.visible = player.loop !== null;
        this._btnLoop.child.icon_name = player.loop === 'Track' ? 'media-playlist-repeat-song-symbolic' : 'media-playlist-repeat-symbolic';
        this._btnLoop.remove_style_pseudo_class('checked');
        if (player.loop && player.loop !== 'None')
            this._btnLoop.add_style_pseudo_class('checked');

        this._volRow.visible = player.hasVolume;
        this._updating = true;
        this._vol.value = Math.min(1, player.volume);
        this._updating = false;
        this._syncVolumeIcon();

        if (changedPlayer || !player.playing)
            this._syncPosition();
        this._loadArt(player);
    }

    async _loadArt(player) {
        const key = `${player.busName}|${player.artUrl}`;
        if (key === this._artKey)
            return;
        this._artKey = key;
        const path = await this._art.load(player.artUrl);
        if (key !== this._artKey)
            return;
        if (path) {
            const uri = GLib.filename_to_uri(path, null).replace(/'/g, '%27');
            this._artBin.set_style(`background-image: url('${uri}'); background-size: cover;`);
            this._artBin.child.visible = false;
        } else {
            this._artBin.set_style(null);
            this._artBin.child.visible = true;
        }
    }

    vfunc_destroy() {
        this._stopTick();
        if (this._managerId) {
            this._manager.disconnect(this._managerId);
            this._managerId = 0;
        }
        super.vfunc_destroy();
    }
});
