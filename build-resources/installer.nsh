# add registry to define TiddlyGit as browser and mail client on Windows 10+
# rewritten in NSH from https://github.com/minbrowser/min/blob/master/main/registryConfig.js
# fix https://github.com/atomery/webcatalog/issues/784
# useful doc https://github.com/electron-userland/electron-builder/issues/837#issuecomment-614127460
# useful doc https://www.electron.build/configuration/nsis#custom-nsis-script

!macro customInstall
  WriteRegStr HKCU 'Software\RegisteredApplications' 'TiddlyGit' 'Software\Clients\StartMenuInternet\TiddlyGit\Capabilities'
  WriteRegStr HKCU 'Software\Classes\TiddlyGit' '' 'TiddlyGit Browser Document'
  WriteRegStr HKCU 'Software\Classes\TiddlyGit\Application' 'ApplicationIcon' '$appExe,0'
  WriteRegStr HKCU 'Software\Classes\TiddlyGit\Application' 'ApplicationName' 'TiddlyGit'
  WriteRegStr HKCU 'Software\Classes\TiddlyGit\Application' 'AppUserModelId' 'TiddlyGit'
  WriteRegStr HKCU 'Software\Classes\TiddlyGit\DefaulIcon' 'ApplicationIcon' '$appExe,0'
  WriteRegStr HKCU 'Software\Classes\TiddlyGit\shell\open\command' '' '"$appExe" "%1"'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TiddlyGit\Capabilities\StartMenu' 'StartMenuInternet' 'TiddlyGit'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TiddlyGit\Capabilities\URLAssociations' 'http' 'TiddlyGit'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TiddlyGit\Capabilities\URLAssociations' 'https' 'TiddlyGit'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TiddlyGit\Capabilities\URLAssociations' 'mailto' 'TiddlyGit'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TiddlyGit\DefaultIcon' '' '$appExe,0'
  WriteRegDWORD HKCU 'Software\Clients\StartMenuInternet\TiddlyGit\InstallInfo' 'IconsVisible' 1
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TiddlyGit\shell\open\command' '' '$appExe'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU 'Software\RegisteredApplications' 'TiddlyGit'
  DeleteRegKey HKCU 'Software\Classes\TiddlyGit'
  DeleteRegKey HKCU 'Software\Clients\StartMenuInternet\TiddlyGit'
!macroend
