<div align="center">

# 🎵 Cadência

**Controle de mídia para o GNOME Shell, bonito e direto na barra.**
Um indicador discreto com o que está tocando e um popup com capa, progresso, volume e todos os seus players.

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-50-4a86cf?logo=gnome&logoColor=white)
![Licença](https://img.shields.io/badge/licen%C3%A7a-GPL--3.0--or--later-blue)
![Status](https://img.shields.io/badge/status-beta-orange)
![Wayland](https://img.shields.io/badge/Wayland-ok-success)
![MPRIS](https://img.shields.io/badge/MPRIS-qualquer%20player-3584e4)

<img src="docs/screenshots/01-popup.png" width="460" alt="Popup da Cadência com capa, progresso, controles e volume">

</div>

---

## ✨ Funcionalidades

| | Recurso | Detalhe |
|---|---|---|
| 🎧 | **Qualquer player** | Spotify, navegadores (YouTube, SoundCloud...), VLC, mpv, Rhythmbox e tudo que fala MPRIS |
| 🖼️ | **Capa do álbum** | Capas locais e remotas (só `https`, imagens de até 2 MB); ficam em cache em `~/.cache/cadencia` por 14 dias |
| ⏱️ | **Progresso com seek** | Clique ou arraste a barra para pular para qualquer ponto |
| ⏯️ | **Controles completos** | Anterior, tocar/pausar, próxima, aleatório e repetir (faixa ou lista) |
| 🔊 | **Volume por player** | Controle no popup ou role o mouse sobre o indicador |
| 🗂️ | **Vários players** | Chips no topo trocam de player; por padrão vale o que está tocando agora |
| 🎨 | **Cor de destaque do sistema** | Segue a cor de destaque do GNOME (Configurações > Aparência), inclusive quando você troca |
| 🌈 | **Cor da capa (opcional)** | Em vez da cor do sistema, a barra de progresso, o play e o chip ativo assumem a cor dominante da capa |
| 🖼️ | **Capa em destaque** | Layout opcional com a capa na largura do popup |
| 🚫 | **Players ignorados** | Esconda players que só atrapalham (abas mudas do navegador, por exemplo) |
| 🖱️ | **Cliques e rolagem configuráveis** | Cada botão do mouse sobre o indicador faz o que você escolher (popup, tocar/pausar, próxima, anterior, trazer o player); rolar muda volume, avança na faixa ou troca de faixa |
| 📜 | **Texto rolante** | Títulos longos deslizam na barra em vez de serem cortados (opcional) |
| 🌍 | **Tradução** | Inglês e português do Brasil, seguindo o idioma do sistema |
| 🏷️ | **Texto da barra** | Título, artista e álbum com separador configurável, e o ícone do app no lugar do ícone de estado |
| 🪟 | **Abrir o player** | Clique na capa para trazer a janela do player à frente |
| ⚙️ | **Preferências** | Posição, texto e ícone da barra, layout do popup, players ignorados e passo do volume |
| 🎨 | **Visual do Gavetta** | Mesmos cantos arredondados, chips e cartões da extensão [Gavetta](https://github.com/bcocheto/gavetta) |

## 📸 Capturas

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/01-popup.png" width="300" alt="Reproduzindo"><br><sub>Tocando, com dois players abertos</sub></td>
    <td align="center"><img src="docs/screenshots/02-pausado.png" width="300" alt="Pausado"><br><sub>Pausado: barra e capa ficam discretas</sub></td>
    <td align="center"><img src="docs/screenshots/03-capa-em-destaque.png" width="300" alt="Capa em destaque"><br><sub>Layout com a capa em destaque</sub></td>
  </tr>
</table>

## 📦 Instalação

> Requer **GNOME Shell 50**.

### A partir do código-fonte

```bash
git clone https://github.com/bcocheto/cadencia.git
cd cadencia
make install
```

Em Wayland, saia e entre na sessão para o GNOME encontrar a extensão. Depois:

```bash
gnome-extensions enable cadencia@bcocheto.github.io
```

Para testar sem sair da sessão, use um shell aninhado (precisa do `mutter-dev-bin`):

```bash
make run
```

## 🧩 Como funciona

```
players MPRIS (D-Bus) ──► Manager ──► indicador na barra
                              └─────► popup (capa, progresso, controles, volume)
```

- `mpris.js`: descobre players pelo D-Bus, acompanha mudanças e expõe os comandos.
- `art.js`: resolve a capa (local ou remota com cache).
- `card.js`: o popup.
- `accent.js`: cor dominante da capa.
- `extension.js`: o indicador, o scroll e o clique do meio.

## 🛠️ Desenvolvimento

| Comando | O que faz |
|---|---|
| `make install` | Compila o schema e copia para `~/.local/share/gnome-shell/extensions` |
| `make run` | Shell aninhado para testar |
| `tools/headless-shot.sh saida.png [duo\|solo\|pause\|cover\|block\|green]` | Abre um shell sem tela com players falsos e salva uma captura do popup |
| `make pot` | Atualiza o modelo de tradução (`po/cadencia.pot`) e mescla nos `.po` |
| `make lint` | Checa a sintaxe, o schema e roda o ESLint (`npm i` antes) |
| `make pack` | Gera `dist/cadencia@bcocheto.github.io.shell-extension.zip` |

## 🗺️ Próximos passos

- [ ] Publicar no extensions.gnome.org
- [x] Cor de destaque extraída da capa
- [x] Players ignorados e texto da barra configurável
- [x] Tradução (gettext), ações configuráveis e texto rolante
- [ ] Mais idiomas (contribuições em `po/` são bem-vindas)
- [ ] Atalho global para abrir o popup
- [ ] Limpeza automática do cache de capas

## 📄 Licença

[GPL-3.0-or-later](LICENSE) © Breno Cocheto
