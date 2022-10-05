# another way https://docs.appimage.org/packaging-guide/converting-binary-packages/pkg2appimage.html
# must have latest released tidgi deb
# note: tidgi.deb(on debt2appimage.json) path must use ~/.cache/deb2appimage/debs/, don't modify it
# status: deb2appimage WIP(test)
# appimagehub: https://github.com/AppImage/appimage.github.io#how-to-submit-appimages-to-the-catalog
# byhand manage this file
# TODO: fix tiddly desktop cache not founded to speedup, update package-locl.json file
appimage_cachedir="./.deb2appimage_cache"
appimage_address="https://github.com/simoniz0r/deb2appimage/releases/download/v0.0.5/deb2appimage-0.0.5-x86_64.AppImage"
bin="$(appimage_cachedir)/deb2appimage.appimage"
config_file="./scripts/deb2appimage.json"
target_dir="./out/"

build-appimage:
	@rm -rf $(appimage_cachedir); mkdir $(appimage_cachedir)
	@wget $(appimage_address) -O ${bin}
	@chmod +x ${bin}
	@$(bin) -j $(config_file) -o $(appimage_cachedir)
	# @cp $(appimage_cachedir/tidig*.Appimage) $(target_dir)
	@echo "✔ 🎉 appimage generated"
