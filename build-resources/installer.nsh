# add registry to define Singlebox as browser and mail client on Windows 10+
# rewritten in NSH from https://github.com/minbrowser/min/blob/master/main/registryConfig.js
# fix https://github.com/atomery/webcatalog/issues/784
# useful doc https://github.com/electron-userland/electron-builder/issues/837#issuecomment-614127460
# useful doc https://www.electron.build/configuration/nsis#custom-nsis-script

!macro customInstall
  WriteRegStr HKCU 'Software\RegisteredApplications' 'Singlebox' 'Software\Clients\StartMenuInternet\Singlebox\Capabilities'
  WriteRegStr HKCU 'Software\Classes\Singlebox' '' 'Singlebox Browser Document'
  WriteRegStr HKCU 'Software\Classes\Singlebox\Application' 'ApplicationIcon' '$appExe,0'
  WriteRegStr HKCU 'Software\Classes\Singlebox\Application' 'ApplicationName' 'Singlebox'
  WriteRegStr HKCU 'Software\Classes\Singlebox\Application' 'AppUserModelId' 'Singlebox'
  WriteRegStr HKCU 'Software\Classes\Singlebox\DefaulIcon' 'ApplicationIcon' '$appExe,0'
  WriteRegStr HKCU 'Software\Classes\Singlebox\shell\open\command' '' '"$appExe" "%1"'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\Singlebox\Capabilities\StartMenu' 'StartMenuInternet' 'Singlebox'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\Singlebox\Capabilities\URLAssociations' 'http' 'Singlebox'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\Singlebox\Capabilities\URLAssociations' 'https' 'Singlebox'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\Singlebox\Capabilities\URLAssociations' 'mailto' 'Singlebox'
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\Singlebox\DefaultIcon' '' '$appExe,0'
  WriteRegDWORD HKCU 'Software\Clients\StartMenuInternet\Singlebox\InstallInfo' 'IconsVisible' 1
  WriteRegStr HKCU 'Software\Clients\StartMenuInternet\Singlebox\shell\open\command' '' '$appExe'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU 'Software\RegisteredApplications' 'Singlebox'
  DeleteRegKey HKCU 'Software\Classes\Singlebox'
  DeleteRegKey HKCU 'Software\Clients\StartMenuInternet\Singlebox'
!macroend
