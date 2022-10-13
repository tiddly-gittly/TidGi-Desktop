# another way https://docs.appimage.org/packaging-guide/converting-binary-packages/pkg2appimage.html
# must have latest released tidgi deb
# note: tidgi.deb(on debt2appimage.json) path must use ~/.cache/deb2appimage/debs/, don't modify it
# status: deb2appimage WIP(test)
# appimagehub: https://github.com/AppImage/appimage.github.io#how-to-submit-appimages-to-the-catalog
# byhand manage this file
# TODO: fix tiddly desktop cache not founded to speedup, update package-locl.json file
# x86 64
appimage_cachedir="deb2appimage_cache"
appimage_address="https://github.com/simoniz0r/deb2appimage/releases/download/v0.0.5/deb2appimage-0.0.5-x86_64.AppImage"
bin="$(appimage_cachedir)/deb2appimage.appimage"
config_file="deb2appimage.json"
# this filename for deb2appimage not support Underline char
# maybe need delete ~/.cache/deb2appimage/
# in github workflow, use cp deb
target_dir="out/make"
version = $(shell node -p "require('./package.json').version")

build-appimage:
	@rm -rf $(appimage_cachedir); mkdir $(appimage_cachedir)
	@make download_bin
	@chmod +x ${bin}
	@make update_version; $(bin) -j $(config_file) -o $(appimage_cachedir)
	@cp $(appimage_cachedir)/*.AppImage $(target_dir)
	@echo "✔ 🎉 appimage generated"

download_bin:
	@wget $(appimage_address) -O ${bin}

update_version:
	@cp scripts/deb2appimage-template.json $(config_file)
	@sed -i "s#download/v[0-9\.\-]*\/tidgi_[0-9\.\-]*_#download/v$(version)\/tidgi_$(version)_#" $(config_file)

.PHONY: clean
clean:
	# @rm -rf deb2appimage*.json
