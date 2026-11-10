import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
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
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);

        this.menu.actor.add_style_class_name('cadencia-boxpointer');
        this._card = new MediaCard(manager, art);
        this._card.connect('raise', () => {
            manager.current?.raise();
            this.menu.close();
        });
        this.menu.box.add_child(this._card);
        this.menu.connect('open-state-changed', (_m, open) => this._card.setActive(open));

        this._managerId = manager.connect('changed', () => this._sync());
        this._settingIds = ['show-title', 'max-title-width', 'hide-when-idle']
            .map(k => settings.connect(`changed::${k}`, () => this._sync()));
        this._sync();
    }

    _sync() {
        const p = this._manager.current;
        const s = this._settings;

        this.visible = !!p || !s.get_boolean('hide-when-idle');
        this._icon.icon_name = p?.playing ? 'media-playback-start-symbolic' : 'media-playback-pause-symbolic';
        this.remove_style_pseudo_class('paused');
        if (p && !p.playing)
            this.add_style_pseudo_class('paused');

        const text = p ? [p.title, p.artist].filter(Boolean).join(' — ') : '';
        this._label.text = text;
        this._label.visible = s.get_boolean('show-title') && !!text;
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
        this._indicator?.destroy();
        this._indicator = null;
        this._manager.destroy();
        this._manager = null;
        this._art.destroy();
        this._art = null;
        this._settings = null;
    }
}
