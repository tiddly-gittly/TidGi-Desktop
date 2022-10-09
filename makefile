# another way https://docs.appimage.org/packaging-guide/converting-binary-packages/pkg2appimage.html
# must have latest released tidgi deb
# note: tidgi.deb(on debt2appimage.json) path must use ~/.cache/deb2appimage/debs/, don't modify it
# status: deb2appimage WIP(test)
# appimagehub: https://github.com/AppImage/appimage.github.io#how-to-submit-appimages-to-the-catalog
# byhand manage this file
# TODO: fix tiddly desktop cache not founded to speedup, update package-locl.json file
appimage_cachedir="deb2appimage_cache"
appimage_address="https://github.com/simoniz0r/deb2appimage/releases/download/v0.0.5/deb2appimage-0.0.5-x86_64.AppImage"
bin="$(appimage_cachedir)/deb2appimage.appimage"
config_file="scripts/deb2appimage.json"
# this filename for deb2appimage not support Underline char
# maybe need delete ~/.cache/deb2appimage/
updated_config_file="deb2appimage_$(shell date +"%Y%m%d%H%M%S").json"
target_dir="out/make"
version = $(shell node -p "require('./package.json').version")

build-appimage:
	@make clean
	@cp ${config_file} ${updated_config_file}
	@sed -i "s#APP_VERSION#$(version)#g" $(updated_config_file)
	@rm -rf $(appimage_cachedir); mkdir $(appimage_cachedir)
	@make download_bin
	@chmod +x ${bin}
	@$(bin) -j $(updated_config_file) -o $(appimage_cachedir)
	@cp $(appimage_cachedir)/*.Appimage $(target_dir)
	@echo "✔ 🎉 appimage generated"

print-version:
	@echo ${version}

download_bin:
	@wget $(appimage_address) -O ${bin}

.PHONY: clean
clean:
	@rm -rf deb2appimage*.json
