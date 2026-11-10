UUID    := cadencia@bcocheto.github.io
SRC     := $(UUID)
DEST    := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: install schemas run pack lint

schemas:
	glib-compile-schemas $(SRC)/schemas

install: schemas
	mkdir -p $(DEST)
	rsync -a --delete $(SRC)/ $(DEST)/
	@echo "Instalada em $(DEST). Reinicie a sessão (Wayland) ou rode 'make run'."

# Shell aninhado para testar sem sair da sessão (precisa de mutter-devkit)
run: install
	dbus-run-session -- gnome-shell --devkit --wayland

# gnome-extensions pack costuma dar segfault; empacota com zip (sem o schema compilado)
pack:
	mkdir -p dist
	rm -f dist/$(UUID).shell-extension.zip
	cd $(SRC) && zip -qr ../dist/$(UUID).shell-extension.zip . -x 'schemas/gschemas.compiled'
	@unzip -l dist/$(UUID).shell-extension.zip

lint:
	@for f in $(SRC)/*.js; do node --check --input-type=module < $$f && echo "ok $$f"; done
	glib-compile-schemas --strict --dry-run $(SRC)/schemas && echo "ok schema"
