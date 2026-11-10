import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');

// Resolve a capa (file:// ou http(s)://) para um arquivo local; capas remotas ficam em ~/.cache/cadencia
export class ArtLoader {
    constructor() {
        this._dir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'cadencia']);
        this._session = null;
        this._cancellable = new Gio.Cancellable();
    }

    async load(url) {
        if (!url)
            return null;
        if (url.startsWith('file://'))
            return Gio.File.new_for_uri(url).get_path();
        if (!/^https?:\/\//.test(url))
            return null;

        const name = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1, url, -1);
        const path = GLib.build_filenamev([this._dir, name]);
        if (GLib.file_test(path, GLib.FileTest.EXISTS))
            return path;

        try {
            this._session ??= new Soup.Session({timeout: 10});
            const msg = Soup.Message.new('GET', url);
            const bytes = await this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, this._cancellable);
            if (msg.get_status() !== Soup.Status.OK)
                return null;
            GLib.mkdir_with_parents(this._dir, 0o755);
            GLib.file_set_contents(path, bytes.get_data());
            return path;
        } catch (_e) {
            return null;
        }
    }

    destroy() {
        this._cancellable.cancel();
        this._session?.abort();
        this._session = null;
    }
}
