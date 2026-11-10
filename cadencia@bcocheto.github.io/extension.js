import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {ArtLoader} from './art.js';
import {MediaCard} from './card.js';
import {Manager} from './mpris.js';

const Indicator = GObject.registerClass(class CadenciaIndicator extends PanelMenu.Button {
    _init(manager, art, settings) {
        super._init(0.5, 'Cadência', false);
        this._manager = manager;
        this._settings = settings;

        const box = new St.BoxLayout({style_class: 'cadencia-panel'});
        this._icon = new St.Icon({icon_name: 'media-playback-start-symbolic', style_class: 'system-status-icon cadencia-panel-icon'});
        this._label = new St.Label({y_align: Clutter.ActorAlign.CENTER, style_class: 'cadencia-panel-label'});
        this._label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        this.menu.actor.add_style_class_name('cadencia-boxpointer');
        this._card = new MediaCard(manager, art, settings);
        this._card.connect('raise', () => {
            this._raisePlayer();
            this.menu.close();
        });
        this.menu.box.add_child(this._card);
        this.menu.connect('open-state-changed', (_m, open) => this._card.setActive(open));

        this._managerId = manager.connect('changed', () => this._sync());
        this._settingIds = ['show-title', 'max-title-width', 'hide-when-idle', 'show-artist', 'show-album', 'separator', 'use-app-icon']
            .map(k => settings.connect(`changed::${k}`, () => this._sync()));
        this._sync();
    }

    // traz a janela do player à frente: pelo aplicativo (.desktop) e, sem ele, pelo MPRIS
    _raisePlayer() {
        const p = this._manager.current;
        if (!p)
            return;
        const app = this._appOf(p);
        if (app)
            app.activate();
        else
            p.raise();
    }

    _appOf(p) {
        return p?.desktopEntry
            ? Shell.AppSystem.get_default().lookup_app(`${p.desktopEntry}.desktop`)
            : null;
    }

    _sync() {
        const p = this._manager.current;
        const s = this._settings;

        this.visible = !!p || !s.get_boolean('hide-when-idle');

        const appIcon = s.get_boolean('use-app-icon') ? this._appOf(p)?.get_icon() : null;
        if (appIcon) {
            this._icon.gicon = appIcon;
        } else {
            this._icon.gicon = null;
            this._icon.icon_name = p?.playing ? 'media-playback-start-symbolic' : 'media-playback-pause-symbolic';
        }
        this._icon.opacity = p && !p.playing ? 150 : 255;
        this.remove_style_pseudo_class('paused');
        if (p && !p.playing)
            this.add_style_pseudo_class('paused');

        const parts = p ? [p.title, s.get_boolean('show-artist') ? p.artist : '', s.get_boolean('show-album') ? p.album : ''] : [];
        const text = parts.filter(Boolean).join(s.get_string('separator'));
        this._label.text = text;
        this._label.visible = s.get_boolean('show-title') && !!text;
        this.accessible_name = text ? `Cadência: ${text}` : 'Cadência';
        const width = s.get_int('max-title-width');
        if (width !== this._width) {
            this._width = width;
            this._label.set_style(`max-width: ${width}px;`);
        }
    }

    vfunc_scroll_event(event) {
        const p = this._manager.current;
        if (!p?.hasVolume || !this._settings.get_boolean('scroll-volume'))
            return Clutter.EVENT_PROPAGATE;
        const dir = event.get_scroll_direction();
        let sign = 0;
        if (dir === Clutter.ScrollDirection.UP) {
            sign = 1;
        } else if (dir === Clutter.ScrollDirection.DOWN) {
            sign = -1;
        } else if (dir === Clutter.ScrollDirection.SMOOTH) {
            // touchpad: acumula o gesto e aplica um passo a cada unidade de rolagem
            this._scrollAcc = (this._scrollAcc ?? 0) - event.get_scroll_delta()[1];
            if (Math.abs(this._scrollAcc) < 1)
                return Clutter.EVENT_STOP;
            sign = Math.sign(this._scrollAcc);
            this._scrollAcc = 0;
        }
        if (!sign)
            return Clutter.EVENT_PROPAGATE;
        const step = this._settings.get_int('volume-step') / 100;
        p.setVolume(Math.min(1, Math.max(0, p.volume + sign * step)));
        return Clutter.EVENT_STOP;
    }

    vfunc_event(event) {
        // clique do meio: tocar/pausar
        if (event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_MIDDLE) {
            this._manager.current?.playPause();
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_event(event);
    }

    vfunc_destroy() {
        this._manager.disconnect(this._managerId);
        this._settingIds.forEach(id => this._settings.disconnect(id));
        super.vfunc_destroy();
    }
});

export default class CadenciaExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._art = new ArtLoader();
        this._manager = new Manager();
        this._manager.setBlocked(this._settings.get_strv('blocked-players'));
        this._blockedId = this._settings.connect('changed::blocked-players',
            () => this._manager.setBlocked(this._settings.get_strv('blocked-players')));
        this._posId = this._settings.connect('changed::panel-position', () => this._mount());
        this._mount();
    }

    _mount() {
        this._indicator?.destroy();
        this._indicator = new Indicator(this._manager, this._art, this._settings);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, this._settings.get_string('panel-position'));
    }

    disable() {
        this._settings.disconnect(this._posId);
        this._settings.disconnect(this._blockedId);
        this._indicator?.destroy();
        this._indicator = null;
        this._manager.destroy();
        this._manager = null;
        this._art.destroy();
        this._art = null;
        this._settings = null;
    }
}
