import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  List,
  ListItemButton,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListItem, ListItemText } from '@/components/ListItem';
import { usePromiseValue } from '@/helpers/useServiceValue';
import type { IProcessInfo } from '@services/native/processInfo';
import type { ICustomSectionProps } from '@services/preferences/definitions/types';
import { usePreferenceObservable } from '@services/preferences/hooks';
import type { IViewInfo } from '@services/view/interface';
import type { IWorkerInfo } from '@services/wiki/interface';
import { Paper, SectionTitle } from '../PreferenceComponents';

export function DeveloperTools(props: ICustomSectionProps): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();

  const [LOG_FOLDER, SETTINGS_FOLDER, V8_CACHE_FOLDER] = usePromiseValue<[string | undefined, string | undefined, string | undefined]>(
    async () => await Promise.all([window.service.context.get('LOG_FOLDER'), window.service.context.get('SETTINGS_FOLDER'), window.service.context.get('V8_CACHE_FOLDER')]),
    [undefined, undefined, undefined],
  )!;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagData, setDiagData] = useState<{ processInfo: IProcessInfo; viewsInfo: IViewInfo[]; workersInfo: IWorkerInfo[] } | undefined>(undefined);
  const [copiedSnackbarOpen, setCopiedSnackbarOpen] = useState(false);
  const [externalApiInfo, setExternalApiInfo] = useState<{ exists: boolean; size?: number; path?: string }>({ exists: false });
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const info = await window.service.database.getDatabaseInfo('externalApi');
        const path = await window.service.database.getDatabasePath('externalApi');
        setExternalApiInfo({ ...info, path });
      } catch (error) {
        void window.service.native.log(
          'error',
          'DeveloperTools: fetch externalApi database info failed',
          {
            function: 'DeveloperTools.fetchInfo',
            error,
          },
        );
      }
    };
    void fetchInfo();
  }, []);

  useEffect(() => {
    const checkPlatform = async () => {
      const platform = await window.service.context.get('platform');
      setIsWindows(platform === 'win32');
    };
    void checkPlatform();
  }, []);

  return (
    <>
      <SectionTitle ref={props.sectionRef}>{t('Preference.DeveloperTools')}</SectionTitle>
      <Paper elevation={0}>
        <List dense disablePadding>
          {LOG_FOLDER === undefined || SETTINGS_FOLDER === undefined ? <ListItem>{t('Loading')}</ListItem> : (
            <>
              <ListItemButton
                onClick={() => {
                  if (LOG_FOLDER !== undefined) {
                    void window.service.native.openPath(LOG_FOLDER, true);
                  }
                }}
              >
                <ListItemText primary={t('Preference.OpenLogFolder')} secondary={t('Preference.OpenLogFolderDetail')} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <ListItemButton
                onClick={() => {
                  if (SETTINGS_FOLDER !== undefined) {
                    void window.service.native.openPath(SETTINGS_FOLDER, true);
                  }
                }}
              >
                <ListItemText primary={t('Preference.OpenMetaDataFolder')} secondary={t('Preference.OpenMetaDataFolderDetail')} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <ListItemButton
                onClick={async () => {
                  if (V8_CACHE_FOLDER !== undefined) {
                    try {
                      await window.service.native.openPath(V8_CACHE_FOLDER, true);
                    } catch (error: unknown) {
                      void window.service.native.log(
                        'error',
                        'DeveloperTools: open V8 cache folder failed',
                        {
                          function: 'DeveloperTools.openV8CacheFolder',
                          error: error as Error,
                        },
                      );
                    }
                  }
                }}
              >
                <ListItemText primary={t('Preference.OpenV8CacheFolder')} secondary={t('Preference.OpenV8CacheFolderDetail')} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              {isWindows && (
                <ListItemButton
                  onClick={async () => {
                    const localAppData = process.env.LOCALAPPDATA;
                    if (localAppData) {
                      // %LOCALAPPDATA%\SquirrelTemp\SquirrelSetup.log
                      const squirrelTemporaryPath = `${localAppData}\\SquirrelTemp`;
                      try {
                        await window.service.native.openPath(squirrelTemporaryPath, false);
                      } catch (error: unknown) {
                        void window.service.native.log(
                          'error',
                          'DeveloperTools: open SquirrelTemp folder failed',
                          {
                            function: 'DeveloperTools.openSquirrelTempFolder',
                            error: error as Error,
                            path: squirrelTemporaryPath,
                          },
                        );
                      }
                    }
                  }}
                >
                  <ListItemText primary={t('Preference.OpenInstallerLogFolder')} secondary={t('Preference.OpenInstallerLogFolderDetail')} />
                  <ChevronRightIcon color='action' />
                </ListItemButton>
              )}
              <Divider />
              <ListItemButton
                onClick={async () => {
                  const [processInfoResult, workersInfoResult, viewsInfoResult] = await Promise.all([
                    window.service.native.getProcessInfo(),
                    window.service.wiki.getWorkersInfo(),
                    window.service.view.getViewsInfo(),
                  ]);
                  setDiagData({
                    processInfo: processInfoResult as unknown as IProcessInfo,
                    workersInfo: workersInfoResult as unknown as IWorkerInfo[],
                    viewsInfo: viewsInfoResult as unknown as IViewInfo[],
                  });
                  setDiagOpen(true);
                }}
              >
                <ListItemText primary={t('Preference.DiagPanel')} secondary={t('Preference.DiagPanelDetail')} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <Divider />
              <ListItemButton
                onClick={async () => {
                  await window.service.preference.resetWithConfirm();
                }}
              >
                <ListItemText primary={t('Preference.RestorePreferences')} />
                <ChevronRightIcon color='action' />
              </ListItemButton>
              <Divider />
              <ListItem>
                <ListItemText
                  primary={t('Preference.ExternalAPIDebug', { ns: 'agent' })}
                  secondary={t('Preference.ExternalAPIDebugDescription', { ns: 'agent' })}
                />
                <Switch
                  edge='end'
                  checked={preference?.externalAPIDebug || false}
                  disabled={preference === undefined}
                  onChange={async () => {
                    await window.service.preference.set('externalAPIDebug', !preference?.externalAPIDebug);
                    const info = await window.service.database.getDatabaseInfo('externalApi');
                    if (!info?.exists) {
                      // if database didn't exist before, enabling externalAPIDebug requires application restart to initialize the database table
                      props.onNeedsRestart?.();
                    }
                  }}
                  name='externalAPIDebug'
                />
              </ListItem>
              {preference?.externalAPIDebug && (
                <>
                  <Divider />
                  <ListItemButton
                    onClick={async () => {
                      if (externalApiInfo.path) {
                        try {
                          await window.service.native.openPath(externalApiInfo.path, true);
                        } catch (error) {
                          void window.service.native.log(
                            'error',
                            'DeveloperTools: open externalApi database folder failed',
                            {
                              function: 'DeveloperTools.openExternalApiDatabaseFolder',
                              error,
                              path: externalApiInfo.path,
                            },
                          );
                        }
                      }
                    }}
                  >
                    <ListItemText
                      primary={t('Preference.OpenDatabaseFolder', { ns: 'agent' })}
                      secondary={externalApiInfo.path || t('Unknown')}
                    />
                    <ChevronRightIcon color='action' />
                  </ListItemButton>
                  <ListItemButton
                    onClick={() => {
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <ListItemText
                      primary={t('Preference.DeleteExternalApiDatabase')}
                      secondary={t('Preference.ExternalApiDatabaseDescription', {
                        size: externalApiInfo.size ? (externalApiInfo.size / 1024 / 1024).toFixed(2) + ' MB' : t('Unknown'),
                      })}
                    />
                    <ChevronRightIcon color='action' />
                  </ListItemButton>
                </>
              )}
            </>
          )}
        </List>
      </Paper>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
        }}
      >
        <DialogTitle>{t('Preference.ConfirmDelete')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('Preference.ConfirmDeleteExternalApiDatabase')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
            }}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={async () => {
              try {
                await window.service.database.deleteDatabase('externalApi');
                setDeleteDialogOpen(false);
                // Refresh info after deletion
                const info = await window.service.database.getDatabaseInfo('externalApi');
                const path = await window.service.database.getDatabasePath('externalApi');
                setExternalApiInfo({ ...info, path });
              } catch (error) {
                void window.service.native.log(
                  'error',
                  'DeveloperTools: delete externalApi database failed',
                  {
                    function: 'DeveloperTools.handleDelete',
                    error,
                  },
                );
              }
            }}
            color='error'
          >
            {t('Delete')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Unified Process & Debug Panel dialog */}
      <Dialog
        open={diagOpen}
        onClose={() => {
          setDiagOpen(false);
        }}
        maxWidth='xl'
        fullWidth
      >
        <DialogTitle>
          {t('Preference.DiagPanel')}
          <Button
            size='small'
            sx={{ ml: 2 }}
            onClick={async () => {
              const [processInfoResult, workersInfoResult, viewsInfoResult] = await Promise.all([
                window.service.native.getProcessInfo(),
                window.service.wiki.getWorkersInfo(),
                window.service.view.getViewsInfo(),
              ]);
              setDiagData({
                processInfo: processInfoResult as unknown as IProcessInfo,
                workersInfo: workersInfoResult as unknown as IWorkerInfo[],
                viewsInfo: viewsInfoResult as unknown as IViewInfo[],
              });
            }}
          >
            {t('Preference.WorkerDebugRefresh')}
          </Button>
        </DialogTitle>
        <DialogContent>
          {diagData === undefined
            ? <Typography>{t('Loading')}</Typography>
            : (
              <>
                {/* Section 1: Node.js main process memory */}
                <Typography variant='subtitle1' fontWeight='bold' gutterBottom sx={{ mt: 1 }}>
                  {`${t('Preference.ProcessInfoMainNode')} — PID ${diagData.processInfo.mainNode.pid}`}
                </Typography>
                <TableContainer sx={{ mb: 3 }}>
                  <Table size='small'>
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('Preference.ProcessInfoTitle')}</TableCell>
                        <TableCell>
                          <Tooltip title={t('Preference.ProcessInfoRSSTooltip')} placement='top'>
                            <span>{t('Preference.ProcessInfoRSS')}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={t('Preference.ProcessInfoHeapUsedTooltip')} placement='top'>
                            <span>{t('Preference.ProcessInfoHeapUsed')}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={t('Preference.ProcessInfoHeapTotalTooltip')} placement='top'>
                            <span>{t('Preference.ProcessInfoHeapTotal')}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={t('Preference.ProcessInfoExternalTooltip')} placement='top'>
                            <span>{t('Preference.ProcessInfoExternal')}</span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>
                          <Typography variant='caption'>{diagData.processInfo.mainNode.title}</Typography>
                        </TableCell>
                        <TableCell>{diagData.processInfo.mainNode.rss_MB}</TableCell>
                        <TableCell>{diagData.processInfo.mainNode.heapUsed_MB}</TableCell>
                        <TableCell>{diagData.processInfo.mainNode.heapTotal_MB}</TableCell>
                        <TableCell>{diagData.processInfo.mainNode.external_MB}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Section 2: Wiki worker_threads (share main process PID, listed separately) */}
                <Typography variant='subtitle1' fontWeight='bold' gutterBottom>
                  {t('Preference.WorkerDebugPanel')}
                </Typography>
                <TableContainer sx={{ mb: 3 }}>
                  <Table size='small'>
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('Preference.WorkerDebugWorkspace')}</TableCell>
                        <TableCell>
                          <Tooltip title={t('Preference.WorkerDebugThreadIdTooltip')} placement='top'>
                            <span>{t('Preference.WorkerDebugThreadId')}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>{t('Preference.WorkerDebugPort')}</TableCell>
                        <TableCell>{t('Preference.WorkerDebugStatus')}</TableCell>
                        <TableCell>
                          <Tooltip title={t('Preference.ProcessInfoRSSTooltip')} placement='top'>
                            <span>{t('Preference.ProcessInfoRSS')}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={t('Preference.ProcessInfoHeapUsedTooltip')} placement='top'>
                            <span>{t('Preference.ProcessInfoHeapUsed')}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>{t('Preference.WorkerDebugActions')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {diagData.workersInfo.map((info) => (
                        <TableRow key={info.workspaceID}>
                          <TableCell>
                            <Typography variant='body2' fontWeight='bold'>{info.workspaceName}</Typography>
                            <Typography variant='caption' color='text.secondary'>{info.workspaceID.slice(0, 8)}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant='body2'>{info.isRunning && info.threadId > 0 ? info.threadId : '-'}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant='body2'>{info.isRunning ? info.port : '-'}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={info.isRunning ? t('Preference.WorkerDebugRunning') : t('Preference.WorkerDebugStopped')}
                              size='small'
                              color={info.isRunning ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell>
                            {info.rss_MB >= 0
                              ? (
                                <Typography
                                  variant='body2'
                                  fontWeight='bold'
                                  color={info.rss_MB > 500 ? 'error' : info.rss_MB > 200 ? 'warning.main' : 'success.main'}
                                >
                                  {`${info.rss_MB} MB`}
                                </Typography>
                              )
                              : <Typography variant='caption' color='text.secondary'>-</Typography>}
                          </TableCell>
                          <TableCell>
                            {info.heapUsed_MB >= 0
                              ? (
                                <Typography variant='body2'>
                                  {`${info.heapUsed_MB} / ${info.heapTotal_MB} MB`}
                                </Typography>
                              )
                              : <Typography variant='caption' color='text.secondary'>-</Typography>}
                          </TableCell>
                          <TableCell>
                            <Button
                              size='small'
                              variant='outlined'
                              disabled={!info.isRunning}
                              onClick={() => {
                                void window.service.native.openURI(`http://127.0.0.1:${info.port}`);
                              }}
                            >
                              {t('Preference.WorkerDebugOpenBrowser')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {diagData.workersInfo.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} align='center'>
                            <Typography color='text.secondary'>{t('Preference.WorkerDebugEmpty')}</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Section 3: Renderer processes — correlate OS renderer PID with WebContentsView registry */}
                <Typography variant='subtitle1' fontWeight='bold' gutterBottom>
                  {t('Preference.ProcessInfoRenderers')}
                </Typography>
                <TableContainer>
                  <Table size='small'>
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <Tooltip title={t('Preference.RendererPIDTooltip')} placement='top'>
                            <span>PID</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>{t('Preference.ViewDebugWorkspace')}</TableCell>
                        <TableCell>{t('Preference.ProcessInfoType')}</TableCell>
                        <TableCell>
                          <Tooltip title={t('Preference.RendererPrivateMemTooltip')} placement='top'>
                            <span>{t('Preference.RendererPrivateMem')}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip title={t('Preference.RendererCPUTooltip')} placement='top'>
                            <span>{t('Preference.RendererCPU')}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>{t('Preference.ViewDebugBounds')}</TableCell>
                        <TableCell>{t('Preference.ViewDebugURL')}</TableCell>
                        <TableCell>{t('Preference.ViewDebugActions')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(() => {
                        const viewsByPid = new Map(diagData.viewsInfo.map((v) => [v.pid, v]));
                        return [...diagData.processInfo.renderers]
                          .sort((a, b) => {
                            const memA = a.private_KB > 0 ? a.private_KB : a.workingSet_KB;
                            const memB = b.private_KB > 0 ? b.private_KB : b.workingSet_KB;
                            return memB - memA;
                          })
                          .map((renderer) => {
                            const matchingView = viewsByPid.get(renderer.pid);
                            return (
                              <TableRow key={renderer.pid}>
                                <TableCell>{renderer.pid}</TableCell>
                                <TableCell>
                                  {matchingView !== undefined
                                    ? (
                                      <>
                                        <Typography variant='body2' fontWeight='bold'>{matchingView.workspaceName}</Typography>
                                        <Chip label={matchingView.windowName} size='small' sx={{ mt: 0.5 }} />
                                      </>
                                    )
                                    : <Typography variant='caption' color='text.secondary'>{renderer.title || '-'}</Typography>}
                                </TableCell>
                                <TableCell>
                                  <Chip label={renderer.type} size='small' />
                                </TableCell>
                                <TableCell>
                                  {renderer.private_KB > 0
                                    ? (
                                      <Typography
                                        variant='body2'
                                        fontWeight='bold'
                                        color={renderer.private_KB > 500_000
                                          ? 'error'
                                          : renderer.private_KB > 200_000
                                          ? 'warning.main'
                                          : 'success.main'}
                                      >
                                        {`${Math.round(renderer.private_KB / 1024)} MB`}
                                      </Typography>
                                    )
                                    : renderer.workingSet_KB > 0
                                    ? (
                                      <Typography
                                        variant='body2'
                                        fontWeight='bold'
                                        color={renderer.workingSet_KB > 500_000
                                          ? 'error'
                                          : renderer.workingSet_KB > 200_000
                                          ? 'warning.main'
                                          : 'success.main'}
                                      >
                                        {`~${Math.round(renderer.workingSet_KB / 1024)} MB`}
                                      </Typography>
                                    )
                                    : <Typography variant='caption' color='text.secondary'>-</Typography>}
                                </TableCell>
                                <TableCell>
                                  {renderer.cpu_percent >= 0
                                    ? (
                                      <Typography
                                        variant='body2'
                                        fontWeight='bold'
                                        color={renderer.cpu_percent > 20
                                          ? 'error'
                                          : renderer.cpu_percent > 5
                                          ? 'warning.main'
                                          : 'text.primary'}
                                      >
                                        {`${renderer.cpu_percent.toFixed(1)} %`}
                                      </Typography>
                                    )
                                    : <Typography variant='caption' color='text.secondary'>-</Typography>}
                                </TableCell>
                                <TableCell>
                                  {matchingView !== undefined
                                    ? (
                                      <Typography variant='caption'>
                                        {`x:${matchingView.bounds.x} y:${matchingView.bounds.y}`}
                                        <br />
                                        {`${matchingView.bounds.width}×${matchingView.bounds.height}`}
                                      </Typography>
                                    )
                                    : '-'}
                                </TableCell>
                                <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <Typography
                                    variant='caption'
                                    title={matchingView?.url ?? renderer.url}
                                    onClick={() => {
                                      const url = (matchingView?.url ?? renderer.url) || '';
                                      if (url) {
                                        void navigator.clipboard.writeText(url);
                                        setCopiedSnackbarOpen(true);
                                      }
                                    }}
                                    sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                  >
                                    {(matchingView?.url ?? renderer.url) || '-'}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  {matchingView !== undefined && !matchingView.isDestroyed && (
                                    <Button
                                      size='small'
                                      variant='outlined'
                                      onClick={() => {
                                        void window.service.view.openDevToolsForView(matchingView.workspaceID, matchingView.windowName);
                                      }}
                                    >
                                      DevTools
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          });
                      })()}
                      {diagData.processInfo.renderers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} align='center'>
                            <Typography color='text.secondary'>{t('Preference.ProcessInfoRenderersEmpty')}</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDiagOpen(false);
            }}
          >
            {t('Cancel')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={copiedSnackbarOpen}
        autoHideDuration={2000}
        onClose={() => {
          setCopiedSnackbarOpen(false);
        }}
        message={t('Preference.CopiedToClipboard')}
      />
    </>
  );
}
