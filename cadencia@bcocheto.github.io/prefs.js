import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const POSITIONS = ['left', 'center', 'right'];
const ACCENTS = ['system', 'cover'];
const SCROLL_ACTIONS = ['volume', 'seek', 'track', 'none'];
const CLICK_ACTIONS = ['menu', 'play-pause', 'next', 'previous', 'raise', 'none'];

export default class CadenciaPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const s = this.getSettings();
        const bind = (key, row, prop = 'active') =>
            s.bind(key, row, prop, Gio.SettingsBindFlags.DEFAULT);

        // linha de seleção ligada a uma chave de texto com valores fixos
        const combo = (key, title, values, labels, subtitle = null) => {
            const row = new Adw.ComboRow({
                title,
                subtitle,
                model: Gtk.StringList.new(labels),
                selected: Math.max(0, values.indexOf(s.get_string(key))),
            });
            row.connect('notify::selected', () => s.set_string(key, values[row.selected]));
            return row;
        };

        const page = new Adw.PreferencesPage({title: 'Cadência', icon_name: 'multimedia-player-symbolic'});

        // ── barra superior ──
        const bar = new Adw.PreferencesGroup({title: _('Top bar')});
        bar.add(combo('panel-position', _('Position'), POSITIONS, [_('Left'), _('Center'), _('Right')]));

        const title = new Adw.SwitchRow({title: _('Show the track title')});
        bind('show-title', title);
        bar.add(title);

        const artist = new Adw.SwitchRow({title: _('Show the artist')});
        bind('show-artist', artist);
        bar.add(artist);

        const album = new Adw.SwitchRow({title: _('Show the album')});
        bind('show-album', album);
        bar.add(album);

        const sep = new Adw.EntryRow({title: _('Separator')});
        bind('separator', sep, 'text');
        bar.add(sep);

        const appIcon = new Adw.SwitchRow({
            title: _('App icon'),
            subtitle: _('Show the player’s icon instead of the play/pause icon'),
        });
        bind('use-app-icon', appIcon);
        bar.add(appIcon);

        const width = new Adw.SpinRow({
            title: _('Maximum text width (px)'),
            adjustment: new Gtk.Adjustment({lower: 80, upper: 600, step_increment: 10}),
        });
        bind('max-title-width', width, 'value');
        bar.add(width);

        const marquee = new Adw.SwitchRow({
            title: _('Scroll long text'),
            subtitle: _('Slides the text when it does not fit, instead of cutting it'),
        });
        bind('scroll-title', marquee);
        bar.add(marquee);

        const hide = new Adw.SwitchRow({title: _('Hide when there is no player')});
        bind('hide-when-idle', hide);
        bar.add(hide);
        page.add(bar);

        // ── cliques e rolagem ──
        const input = new Adw.PreferencesGroup({title: _('Clicks and scrolling')});
        const clickLabels = [_('Open the popup'), _('Play/pause'), _('Next track'), _('Previous track'), _('Bring the player forward'), _('Nothing')];
        input.add(combo('left-click-action', _('Left click'), CLICK_ACTIONS, clickLabels));
        input.add(combo('middle-click-action', _('Middle click'), CLICK_ACTIONS, clickLabels));
        input.add(combo('right-click-action', _('Right click'), CLICK_ACTIONS, clickLabels));
        input.add(combo('scroll-action', _('Scrolling over the indicator'), SCROLL_ACTIONS,
            [_('Change the volume'), _('Seek in the track'), _('Change the track'), _('Nothing')]));

        const step = new Adw.SpinRow({
            title: _('Volume step (%)'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 25, step_increment: 1}),
        });
        bind('volume-step', step, 'value');
        input.add(step);

        const seek = new Adw.SpinRow({
            title: _('Seek step (seconds)'),
            adjustment: new Gtk.Adjustment({lower: 1, upper: 60, step_increment: 1}),
        });
        bind('seek-step', seek, 'value');
        input.add(seek);
        page.add(input);

        // ── popup ──
        const popup = new Adw.PreferencesGroup({title: _('Popup')});
        popup.add(combo('accent-source', _('Accent color'), ACCENTS,
            [_('System color'), _('Album cover')],
            _('From the system (Settings > Appearance) or from the album cover')));

        const cover = new Adw.SwitchRow({
            title: _('Large cover'),
            subtitle: _('The cover fills the popup width, with centered text'),
        });
        bind('cover-layout', cover);
        popup.add(cover);

        const blocked = new Adw.EntryRow({title: _('Ignored players (comma-separated)')});
        blocked.text = s.get_strv('blocked-players').join(', ');
        blocked.connect('changed', () => s.set_strv('blocked-players',
            blocked.text.split(',').map(t => t.trim()).filter(Boolean)));
        popup.add(blocked);
        page.add(popup);

        window.add(page);
    }
}
