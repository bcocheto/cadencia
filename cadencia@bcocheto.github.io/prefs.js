import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const POSITIONS = ['left', 'center', 'right'];

export default class CadenciaPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const s = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Cadência', icon_name: 'multimedia-player-symbolic'});

        const bar = new Adw.PreferencesGroup({title: 'Barra superior'});
        const pos = new Adw.ComboRow({
            title: 'Posição',
            model: Gtk.StringList.new(['Esquerda', 'Centro', 'Direita']),
            selected: Math.max(0, POSITIONS.indexOf(s.get_string('panel-position'))),
        });
        pos.connect('notify::selected', () => s.set_string('panel-position', POSITIONS[pos.selected]));
        bar.add(pos);

        const title = new Adw.SwitchRow({title: 'Mostrar título da faixa'});
        s.bind('show-title', title, 'active', 0);
        bar.add(title);

        const width = new Adw.SpinRow({
            title: 'Largura máxima do título (px)',
            adjustment: new Gtk.Adjustment({lower: 80, upper: 600, step_increment: 10}),
        });
        s.bind('max-title-width', width, 'value', 0);
        bar.add(width);

        const hide = new Adw.SwitchRow({title: 'Esconder quando não há player'});
        s.bind('hide-when-idle', hide, 'active', 0);
        bar.add(hide);
        page.add(bar);

        const input = new Adw.PreferencesGroup({title: 'Controles'});
        const scroll = new Adw.SwitchRow({title: 'Rolar sobre o indicador muda o volume', subtitle: 'O clique do meio alterna tocar/pausar'});
        s.bind('scroll-volume', scroll, 'active', 0);
        input.add(scroll);

        const step = new Adw.SpinRow({
            title: 'Passo do volume (%)',
            adjustment: new Gtk.Adjustment({lower: 1, upper: 25, step_increment: 1}),
        });
        s.bind('volume-step', step, 'value', 0);
        input.add(step);
        page.add(input);

        window.add(page);
    }
}
