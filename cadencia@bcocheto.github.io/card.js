import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';

import {accentFromFile} from './accent.js';

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

function setEnabled(widget, enabled) {
    widget.reactive = widget.can_focus = enabled;
    if (enabled)
        widget.remove_style_class_name('disabled');
    else
        widget.add_style_class_name('disabled');
}

function label(styleClass) {
    const l = new St.Label({style_class: styleClass, x_align: Clutter.ActorAlign.START});
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
}

// Corpo do popup: players, capa, faixa, progresso, controles e volume
export const MediaCard = GObject.registerClass({
    Signals: {'raise': {}},
}, class CadenciaCard extends St.BoxLayout {
    _init(manager, art, settings) {
        super._init({style_class: 'cadencia-popup', vertical: true});
        this._manager = manager;
        this._art = art;
        this._settings = settings;
        this._accent = null;
        this._player = null;
        this._artKey = null;
        this._active = false;
        this._dead = false;
        this._dirty = false;
        this._chipsKey = '';
        this._dragging = false;
        this._volDragging = false;
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
        this._posLabel = new St.Label({text: '0:00', style_class: 'cadencia-meta cadencia-time-pos', x_expand: true});
        this._durLabel = new St.Label({text: '0:00', style_class: 'cadencia-meta cadencia-time-dur'});
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
        this._vol.connect('drag-begin', () => (this._volDragging = true));
        this._vol.connect('drag-end', () => (this._volDragging = false));
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
        this._empty.add_child(new St.Label({text: 'Nada tocando', style_class: 'cadencia-empty-title', x_align: Clutter.ActorAlign.CENTER}));
        this._empty.add_child(new St.Label({text: 'Abra um player para controlá-lo aqui', style_class: 'cadencia-meta', x_align: Clutter.ActorAlign.CENTER}));
        this.add_child(this._empty);

        // com o popup fechado só marcamos como desatualizado; reconstrói ao abrir
        this._layoutId = settings.connect('changed::cover-layout', () => this._applyLayout());
        this._applyLayout();

        this._managerId = manager.connect('changed', () => {
            if (this._active)
                this.rebuild();
            else
                this._dirty = true;
        });
        this.rebuild();
    }

    // "capa dominante": capa na largura do popup, textos centralizados
    _applyLayout() {
        const cover = this._settings.get_boolean('cover-layout');
        this._track.orientation = cover ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
        if (cover)
            this._track.add_style_class_name('cover');
        else
            this._track.remove_style_class_name('cover');
        const align = cover ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START;
        for (const l of [this._source, this._title, this._artist, this._album])
            l.x_align = align;
        this._artBin.x_align = cover ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START;
        this._title.clutter_text.set_line_alignment(cover ? Pango.Alignment.CENTER : Pango.Alignment.LEFT);
    }

    // cor de destaque da capa (null volta ao azul padrão)
    _applyAccent(color) {
        this._accent = color;
        const slider = color ? `-barlevel-active-background-color: ${color}; color: ${color};` : null;
        this._seek.set_style(slider);
        this._vol.set_style(slider);
        this._btnPlay.set_style(color ? `background-color: ${color};` : null);
        this._source.set_style(color ? `color: ${color};` : null);
        this._styleChips();
    }

    _styleChips() {
        for (const chip of this._chips.get_children())
            chip.set_style(this._accent && chip.has_style_class_name('active') ? `background-color: ${this._accent};` : null);
    }

    // chamado quando o menu abre/fecha: só consulta a posição enquanto visível
    setActive(active) {
        this._active = active;
        if (active) {
            if (this._dirty)
                this.rebuild();
            else
                this._syncPosition();
        }
        this._updateTick();
    }

    // o relógio só corre com o popup aberto e o player tocando
    _updateTick() {
        const want = this._active && !!this._player?.playing;
        if (want && !this._tick) {
            this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this._syncPosition();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!want) {
            this._stopTick();
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
        if (this._dead || player !== this._player || this._dragging || pos === null)
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
        this._dirty = false;
        this._rebuildChips(list, player);

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
        setEnabled(this._seek, player.canSeek && player.length > 0);
        if (player.playing)
            this.remove_style_class_name('paused');
        else
            this.add_style_class_name('paused');
        this._artBin.opacity = player.playing ? 255 : 190;

        this._btnPlay.child.icon_name = player.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._btnPlay.accessible_name = player.playing ? 'Pausar' : 'Reproduzir';
        setEnabled(this._btnPrev, player.canPrev);
        setEnabled(this._btnNext, player.canNext);

        this._btnShuffle.visible = player.shuffle !== null;
        this._btnShuffle.remove_style_pseudo_class('checked');
        if (player.shuffle)
            this._btnShuffle.add_style_pseudo_class('checked');
        this._btnLoop.visible = player.loop !== null;
        this._btnLoop.child.icon_name = player.loop === 'Track' ? 'media-playlist-repeat-song-symbolic' : 'media-playlist-repeat-symbolic';
        this._btnLoop.accessible_name = player.loop === 'Track' ? 'Repetir faixa' : player.loop === 'Playlist' ? 'Repetir tudo' : 'Repetição desligada';
        this._btnShuffle.accessible_name = player.shuffle ? 'Aleatório ligado' : 'Aleatório desligado';
        this._btnLoop.remove_style_pseudo_class('checked');
        if (player.loop && player.loop !== 'None')
            this._btnLoop.add_style_pseudo_class('checked');

        this._volRow.visible = player.hasVolume;
        this._updating = true;
        if (!this._volDragging)
            this._vol.value = Math.min(1, player.volume);
        this._updating = false;
        this._syncVolumeIcon();

        if (changedPlayer || !player.playing)
            this._syncPosition();
        this._updateTick();
        this._loadArt(player);
    }

    // chips só com mais de um player; só recria quando a lista muda
    _rebuildChips(list, current) {
        const names = list.map(p => p.identity);
        const labels = list.map((p, i) => names.indexOf(p.identity) === i || names.filter(n => n === p.identity).length === 1
            ? p.identity
            : `${p.identity} (${names.slice(0, i + 1).filter(n => n === p.identity).length})`);
        const key = list.map((p, i) => `${p.busName}|${labels[i]}`).join(',');

        if (key !== this._chipsKey) {
            this._chipsKey = key;
            this._chips.destroy_all_children();
            list.forEach((p, i) => {
                const chip = new St.Button({
                    label: labels[i], can_focus: true, reactive: true, track_hover: true,
                    style_class: 'cadencia-chip',
                });
                chip.connect('clicked', () => this._manager.pin(p));
                chip._busName = p.busName;
                this._chips.add_child(chip);
            });
        }
        this._chips.visible = list.length > 1;
        for (const chip of this._chips.get_children()) {
            if (chip._busName === current?.busName)
                chip.add_style_class_name('active');
            else
                chip.remove_style_class_name('active');
        }
        this._styleChips();
    }

    async _loadArt(player) {
        const key = `${player.busName}|${player.artUrl}|${player.title}`;
        if (key === this._artKey)
            return;
        this._artKey = key;
        const path = await this._art.load(player.artUrl);
        if (this._dead || key !== this._artKey)
            return;
        if (path) {
            const uri = GLib.filename_to_uri(path, null).replace(/'/g, '%27');
            this._artBin.set_style(`background-image: url('${uri}'); background-size: cover;`);
            this._artBin.remove_style_class_name('no-cover');
            this._artBin.child.visible = false;
            this._applyAccent(accentFromFile(path));
        } else {
            this._artBin.set_style(null);
            this._artBin.add_style_class_name('no-cover');
            this._artBin.child.visible = true;
            this._applyAccent(null);
        }
        this._artBin.opacity = 0;
        this._artBin.ease({opacity: this._player?.playing ? 255 : 190, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    vfunc_destroy() {
        this._dead = true;
        this._settings.disconnect(this._layoutId);
        this._artKey = null;
        this._player = null;
        this._stopTick();
        if (this._managerId) {
            this._manager.disconnect(this._managerId);
            this._managerId = 0;
        }
        super.vfunc_destroy();
    }
});
