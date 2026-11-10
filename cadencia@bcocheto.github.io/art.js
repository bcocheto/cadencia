import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_AGE_DAYS = 14;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// Endereços que o shell não deve acessar a pedido de um player (a URL vem da página,
// no caso dos navegadores): loopback, rede local e nomes locais.
function isLocalHost(host) {
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
        return true;
    const addr = Gio.InetAddress.new_from_string(host);
    if (!addr)
        return false;
    if (addr.is_any || addr.is_loopback || addr.is_link_local || addr.is_site_local || addr.is_multicast)
        return true;
    // IPv6 ULA (fc00::/7)
    return addr.get_family() === Gio.SocketFamily.IPV6 && (addr.to_bytes()[0] & 0xfe) === 0xfc;
}

// Resolve a capa (file:// ou https://) para um arquivo local.
// Capas remotas ficam em ~/.cache/cadencia e são apagadas depois de 14 dias.
export class ArtLoader {
    constructor() {
        this._dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'cadencia']);
        this._session = null;
        this._pending = new Map();
        this._cancellable = new Gio.Cancellable();
        this._prune();
    }

    load(url) {
        if (!url)
            return Promise.resolve(null);
        if (url.startsWith('file://')) {
            const path = Gio.File.new_for_uri(url).get_path();
            return Promise.resolve(path && GLib.file_test(path, GLib.FileTest.IS_REGULAR) ? path : null);
        }
        if (!url.startsWith('https://'))
            return Promise.resolve(null);

        const name = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1, url, -1);
        const path = GLib.build_filenamev([this._dir, name]);
        if (GLib.file_test(path, GLib.FileTest.EXISTS))
            return Promise.resolve(path);

        // um único download por URL, mesmo com vários pedidos simultâneos
        if (!this._pending.has(name)) {
            const job = this._download(url, path).finally(() => this._pending.delete(name));
            this._pending.set(name, job);
        }
        return this._pending.get(name);
    }

    _download(url, path) {
        let uri;
        try {
            uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
        } catch (_e) {
            return Promise.resolve(null);
        }
        if (isLocalHost(uri.get_host()))
            return Promise.resolve(null);

        this._session ??= new Soup.Session({timeout: 10});
        const msg = Soup.Message.new_from_uri('GET', uri);
        return new Promise(resolve => {
            this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, this._cancellable, (session, res) => {
                try {
                    const bytes = session.send_and_read_finish(res);
                    const type = msg.get_response_headers().get_content_type()[0];
                    if (msg.get_status() !== Soup.Status.OK || !IMAGE_TYPES.has(type) ||
                        bytes.get_size() === 0 || bytes.get_size() > MAX_BYTES) {
                        resolve(null);
                        return;
                    }
                    GLib.mkdir_with_parents(this._dir, 0o700);
                    GLib.file_set_contents(path, bytes.get_data());
                    resolve(path);
                } catch (_e) {
                    resolve(null);
                }
            });
        });
    }

    _prune() {
        try {
            const dir = Gio.File.new_for_path(this._dir);
            if (!dir.query_exists(null))
                return;
            const limit = GLib.get_real_time() / 1e6 - MAX_AGE_DAYS * 86400;
            const en = dir.enumerate_children('standard::name,time::modified', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = en.next_file(null))) {
                if (info.get_attribute_uint64('time::modified') < limit)
                    en.get_child(info).delete(null);
            }
            en.close(null);
        } catch (e) {
            console.error(`Cadência: falha ao limpar o cache de capas: ${e.message}`);
        }
    }

    destroy() {
        this._cancellable.cancel();
        this._session?.abort();
        this._session = null;
        this._pending.clear();
    }
}
