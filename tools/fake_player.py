#!/usr/bin/env python3
"""Player MPRIS falso para testar a extensão sem abrir Spotify ou navegador.
uso: fake_player.py <nome> <título> [capa-url] [Playing|Paused] [artista] [álbum]"""
import sys, time
from gi.repository import Gio, GLib
name, title = sys.argv[1], sys.argv[2]
art = sys.argv[3] if len(sys.argv) > 3 else ''
status = sys.argv[4] if len(sys.argv) > 4 else 'Playing'
artist = sys.argv[5] if len(sys.argv) > 5 else 'Artista de Teste'
album = sys.argv[6] if len(sys.argv) > 6 else 'Álbum de Teste'
XML = '''<node>
<interface name="org.mpris.MediaPlayer2"><method name="Raise"/><method name="Quit"/>
<property name="CanRaise" type="b" access="read"/><property name="Identity" type="s" access="read"/><property name="DesktopEntry" type="s" access="read"/></interface>
<interface name="org.mpris.MediaPlayer2.Player"><method name="PlayPause"/><method name="Next"/><method name="Previous"/>
<method name="Seek"><arg type="x" direction="in"/></method>
<method name="SetPosition"><arg type="o" direction="in"/><arg type="x" direction="in"/></method>
<property name="PlaybackStatus" type="s" access="read"/><property name="LoopStatus" type="s" access="readwrite"/>
<property name="Shuffle" type="b" access="readwrite"/><property name="Volume" type="d" access="readwrite"/>
<property name="Metadata" type="a{sv}" access="read"/><property name="Position" type="x" access="read"/>
<property name="CanGoNext" type="b" access="read"/><property name="CanGoPrevious" type="b" access="read"/>
<property name="CanPlay" type="b" access="read"/><property name="CanSeek" type="b" access="read"/></interface></node>'''
st = {'status': status, 'loop': 'None', 'shuffle': False, 'vol': 0.6, 'start': time.time(), 'off': 42.0}
def md():
    d = {'mpris:trackid': GLib.Variant('o', '/t/1'), 'mpris:length': GLib.Variant('x', 215_000_000),
         'xesam:title': GLib.Variant('s', title), 'xesam:artist': GLib.Variant('as', [artist]), 'xesam:album': GLib.Variant('s', album)}
    if art: d['mpris:artUrl'] = GLib.Variant('s', art)
    return GLib.Variant('a{sv}', d)
def pos(): return st['off'] + (time.time()-st['start'] if st['status']=='Playing' else 0)
def props(iface):
    if iface.endswith('Player'):
        return {'PlaybackStatus': GLib.Variant('s', st['status']), 'LoopStatus': GLib.Variant('s', st['loop']),
            'Shuffle': GLib.Variant('b', st['shuffle']), 'Volume': GLib.Variant('d', st['vol']), 'Metadata': md(),
            'Position': GLib.Variant('x', int(pos()*1e6)), 'CanGoNext': GLib.Variant('b', True), 'CanGoPrevious': GLib.Variant('b', True),
            'CanPlay': GLib.Variant('b', True), 'CanSeek': GLib.Variant('b', True)}
    return {'CanRaise': GLib.Variant('b', True), 'Identity': GLib.Variant('s', name), 'DesktopEntry': GLib.Variant('s', 'x')}
conn = None
def emit(): conn.emit_signal(None, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties', 'PropertiesChanged',
    GLib.Variant('(sa{sv}as)', ('org.mpris.MediaPlayer2.Player', {k: v for k, v in props('Player').items() if k != 'Position'}, [])))
def call(c, sender, path, iface, method, params, inv):
    print('call', iface, method, params, flush=True)
    if method == 'PlayPause':
        st['off'] = pos(); st['start'] = time.time(); st['status'] = 'Paused' if st['status']=='Playing' else 'Playing'; emit()
    elif method == 'SetPosition': st['off'] = params[1]/1e6; st['start'] = time.time()
    inv.return_value(None)
def get(c, sender, path, iface, prop): return props(iface)[prop]
def setp(c, sender, path, iface, prop, val):
    print('set', prop, val, flush=True)
    st[{'LoopStatus':'loop','Shuffle':'shuffle','Volume':'vol'}[prop]] = val.unpack(); emit(); return True
def on_bus(c, n):
    global conn; conn = c
    for ni in Gio.DBusNodeInfo.new_for_xml(XML).interfaces: c.register_object('/org/mpris/MediaPlayer2', ni, call, get, setp)
Gio.bus_own_name(Gio.BusType.SESSION, 'org.mpris.MediaPlayer2.' + name, Gio.BusNameOwnerFlags.NONE, on_bus, None, None)
GLib.MainLoop().run()
