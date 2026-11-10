import GdkPixbuf from 'gi://GdkPixbuf';

function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min)
        return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r)
        h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g)
        h = (b - r) / d + 2;
    else
        h = (r - g) / d + 4;
    return [h / 6, s, l];
}

function hslToHex(h, s, l) {
    const f = n => {
        const k = (n + h * 12) % 12;
        const a = s * Math.min(l, 1 - l);
        const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// Cor de destaque da capa: agrupa os pixels em faixas de matiz (ponderados pela saturação) e
// usa a faixa dominante, para não misturar matizes opostos num tom lamacento. O resultado é
// ajustado para ter contraste no fundo escuro do popup. Devolve "#rrggbb", ou null se a capa
// for acinzentada.
const BINS = 12;

export function accentFromFile(path) {
    try {
        const pb = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, 24, 24, false);
        const px = pb.get_pixels();
        const n = pb.get_n_channels();
        const stride = pb.get_rowstride();
        const bins = Array.from({length: BINS}, () => ({w: 0, r: 0, g: 0, b: 0}));
        let total = 0;
        for (let y = 0; y < pb.get_height(); y++) {
            for (let x = 0; x < pb.get_width(); x++) {
                const i = y * stride + x * n;
                const a = n === 4 ? px[i + 3] / 255 : 1;
                const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
                const max = Math.max(r, g, b);
                const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
                const w = a * sat * sat * (0.2 + max);
                if (w <= 0)
                    continue;
                const bin = bins[Math.min(BINS - 1, Math.floor(rgbToHsl(r, g, b)[0] * BINS))];
                bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
                total += w;
            }
        }
        if (total < 0.5)
            return null;
        const top = bins.reduce((a, b) => (b.w > a.w ? b : a));
        const [h, s, l] = rgbToHsl(top.r / top.w, top.g / top.w, top.b / top.w);
        return hslToHex(h, Math.min(0.85, Math.max(0.45, s)), Math.min(0.62, Math.max(0.48, l)));
    } catch (_e) {
        return null;
    }
}
