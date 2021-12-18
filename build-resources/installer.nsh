# add registry to define TidGi as browser and mail client on Windows 10+
# rewritten in NSH from https://github.com/minbrowser/min/blob/master/main/registryConfig.js
# fix https://github.com/atomery/webcatalog/issues/784
# useful doc https://github.com/electron-userland/electron-builder/issues/837#issuecomment-614127460
# useful doc https://www.electron.build/configuration/nsis#custom-nsis-script

!macro customInstall
  WriteRegStr HKCU 'Software\RegisteredApplications' 'TidGi' 'Software\Clients\StartMenuInternet\TidGi\Capabilities'
  WriteRegStr HKCU 'Software\Classes\TidGi' '' 'TidGi Browser Document'
  WriteRegStr HKCU 'Software\Classes\TidGi\Application' 'ApplicationIcon' '$appExe,0'
  WriteRegStr HKCU 'Software\Classes\TidGi\Application' 'ApplicationName' 'TidGi'
  WriteRegStr HKCU 'Software\Classes\TidGi\Application' 'AppUserModelId' 'TidGi'
  WriteRegStr HKCU 'Software\Classes\TidGi\DefaulIcon' 'ApplicationIcon' '$appExe,0'
  WriteRegStr HKCU 'Software\Classes\TidGi\shell\open\command' '' '"$appExe" "%1"'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TidGi\Capabilities\StartMenu' 'StartMenuInternet' 'TidGi'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TidGi\Capabilities\URLAssociations' 'http' 'TidGi'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TidGi\Capabilities\URLAssociations' 'https' 'TidGi'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TidGi\Capabilities\URLAssociations' 'mailto' 'TidGi'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TidGi\DefaultIcon' '' '$appExe,0'
  WriteRegDWORD HKCU 'Software\Clients\StartMenuInternet\TidGi\InstallInfo' 'IconsVisible' 1
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\TidGi\shell\open\command' '' '$appExe'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU 'Software\RegisteredApplications' 'TidGi'
  DeleteRegKey HKCU 'Software\Classes\TidGi'
  DeleteRegKey HKCU 'Software\Clients\StartMenuInternet\TidGi'
!macroend
