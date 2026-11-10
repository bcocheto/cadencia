UUID    := cadencia@bcocheto.github.io
SRC     := $(UUID)
DEST    := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: install schemas mo pot run pack lint

schemas:
	glib-compile-schemas $(SRC)/schemas

# tradução: po/*.po viram locale/<idioma>/LC_MESSAGES/<uuid>.mo dentro da extensão
mo:
	@for po in po/*.po; do \
		lang=$$(basename $$po .po); \
		mkdir -p $(SRC)/locale/$$lang/LC_MESSAGES; \
		msgfmt --check -o $(SRC)/locale/$$lang/LC_MESSAGES/$(UUID).mo $$po; \
	done

# atualiza o modelo de tradução e mescla nos .po existentes
pot:
	xgettext --from-code=UTF-8 --language=JavaScript -k_ --package-name=cadencia \
		--copyright-holder="Breno Cocheto" --msgid-bugs-address="https://github.com/bcocheto/cadencia/issues" \
		-o po/cadencia.pot $(SRC)/*.js
	@for po in po/*.po; do msgmerge --update --backup=none $$po po/cadencia.pot; done

install: schemas mo
	mkdir -p $(DEST)
	rsync -a --delete $(SRC)/ $(DEST)/
	@echo "Instalada em $(DEST). Reinicie a sessão (Wayland) ou rode 'make run'."

# Shell aninhado para testar sem sair da sessão (precisa de mutter-devkit)
run: install
	dbus-run-session -- gnome-shell --devkit --wayland

# gnome-extensions pack costuma dar segfault; empacota com zip (sem o schema compilado)
pack: mo
	mkdir -p dist
	rm -f dist/$(UUID).shell-extension.zip
	cd $(SRC) && zip -qr ../dist/$(UUID).shell-extension.zip . -x 'schemas/gschemas.compiled'
	@unzip -l dist/$(UUID).shell-extension.zip

lint:
	@npx --no-install eslint $(SRC) 2>/dev/null && echo "ok eslint" || echo "eslint indisponível ou com avisos (rode npm i)"
	@for f in $(SRC)/*.js; do node --check --input-type=module < $$f && echo "ok $$f"; done
	glib-compile-schemas --strict --dry-run $(SRC)/schemas && echo "ok schema"
