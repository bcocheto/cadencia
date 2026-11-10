# Cadência

Controle de mídia para o **GNOME Shell 50**, no padrão visual do [Gavetta](https://github.com/bcocheto/gavetta).
Funciona com qualquer player MPRIS: Spotify, navegadores, VLC, mpv, Rhythmbox etc.

- **Barra:** ícone de estado + título e artista da faixa. Clique abre o popup, clique do meio alterna tocar/pausar, rolar muda o volume.
- **Popup:** capa (local ou remota, com cache em `~/.cache/cadencia`), progresso com seek, anterior/play/próxima, aleatório, repetir e volume.
- **Vários players:** chips no topo trocam de player; por padrão vale o que está tocando.
- **Preferências:** posição na barra, título, largura, esconder sem player, passo do volume.

## Desenvolvimento

```bash
make install   # compila o schema e copia para ~/.local/share/gnome-shell/extensions
make run       # shell aninhado (precisa do mutter-dev-bin)
make lint
make pack      # dist/*.zip
```

Licença: GPL-3.0-or-later.
