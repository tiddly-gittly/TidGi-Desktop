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
import type { IProcessInfo } from '@services/native/processInfo';
import type { ICustomItemProps } from '@services/preferences/definitions/types';
import { usePreferenceObservable } from '@services/preferences/hooks';
import type { IPreferences } from '@services/preferences/interface';
import type { IViewInfo } from '@services/view/interface';
import type { IWorkerInfo } from '@services/wiki/interface';

export function buildVsCodeMcpUrl(preference: Pick<IPreferences, 'mcpServerPort' | 'mcpServerRequireToken' | 'mcpServerToken'>): string {
  const token = preference.mcpServerToken.trim();
  return `http://127.0.0.1:${preference.mcpServerPort}/mcp${preference.mcpServerRequireToken && token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export function DeveloperMcpVsCodeUrlItem(): React.JSX.Element | null {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const [copiedSnackbarOpen, setCopiedSnackbarOpen] = useState(false);

  if (preference === undefined) return null;

  const token = preference.mcpServerToken.trim();
  const requiresToken = preference.mcpServerRequireToken;
  const copyDisabled = !requiresToken || token.length === 0;
  const url = buildVsCodeMcpUrl(preference);

  return (
    <>
      <ListItemButton
        disabled={copyDisabled}
        onClick={() => {
          void navigator.clipboard.writeText(url);
          setCopiedSnackbarOpen(true);
        }}
      >
        <ListItemText
          primary={t('Preference.CopyMcpServerUrl')}
          secondary={!requiresToken
            ? t('Preference.CopyMcpServerUrlRequiresAuthDescription')
            : copyDisabled
            ? t('Preference.CopyMcpServerUrlDisabledDescription')
            : t('Preference.CopyMcpServerUrlDescription')}
        />
        <ChevronRightIcon color='action' />
      </ListItemButton>
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

export function DeveloperDiagPanelItem(): React.JSX.Element {
  const { t } = useTranslation();
  const [diagOpen, setDiagOpen] = useState(false);
  const [copiedSnackbarOpen, setCopiedSnackbarOpen] = useState(false);
  const [diagData, setDiagData] = useState<{ processInfo: IProcessInfo; viewsInfo: IViewInfo[]; workersInfo: IWorkerInfo[] } | undefined>(undefined);

  const loadDiagData = async () => {
    const [processInfoResult, workersInfoResult, viewsInfoResult] = await Promise.all([
      window.service.native.getProcessInfo(),
      window.service.wiki.getWorkersInfo(),
      window.service.view.getViewsInfo(),
    ]);
    setDiagData({
      processInfo: processInfoResult,
      workersInfo: workersInfoResult,
      viewsInfo: viewsInfoResult,
    });
  };

  return (
    <>
      <ListItemButton
        onClick={async () => {
          await loadDiagData();
          setDiagOpen(true);
        }}
      >
        <ListItemText primary={t('Preference.DiagPanel')} secondary={t('Preference.DiagPanelDetail')} />
        <ChevronRightIcon color='action' />
      </ListItemButton>
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
              await loadDiagData();
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
                <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 'bold', mt: 1 }}>
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

                <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 'bold' }}>
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
                            <Typography variant='body2' sx={{ fontWeight: 'bold' }}>{info.workspaceName}</Typography>
                            <Typography variant='caption' sx={{ color: 'text.secondary' }}>{info.workspaceID.slice(0, 8)}</Typography>
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
                                <Typography variant='body2' color={info.rss_MB > 500 ? 'error' : info.rss_MB > 200 ? 'warning.main' : 'success.main'} sx={{ fontWeight: 'bold' }}>
                                  {`${info.rss_MB} MB`}
                                </Typography>
                              )
                              : <Typography variant='caption' sx={{ color: 'text.secondary' }}>-</Typography>}
                          </TableCell>
                          <TableCell>
                            {info.heapUsed_MB >= 0
                              ? <Typography variant='body2'>{`${info.heapUsed_MB} / ${info.heapTotal_MB} MB`}</Typography>
                              : <Typography variant='caption' sx={{ color: 'text.secondary' }}>-</Typography>}
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
                            <Typography sx={{ color: 'text.secondary' }}>{t('Preference.WorkerDebugEmpty')}</Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Typography variant='subtitle1' gutterBottom sx={{ fontWeight: 'bold' }}>
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
                        const viewsByPid = new Map(diagData.viewsInfo.map((view) => [view.pid, view]));
                        return [...diagData.processInfo.renderers]
                          .sort((left, right) => {
                            const leftMemory = left.private_KB > 0 ? left.private_KB : left.workingSet_KB;
                            const rightMemory = right.private_KB > 0 ? right.private_KB : right.workingSet_KB;
                            return rightMemory - leftMemory;
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
                                        <Typography variant='body2' sx={{ fontWeight: 'bold' }}>{matchingView.workspaceName}</Typography>
                                        <Chip label={matchingView.windowName} size='small' sx={{ mt: 0.5 }} />
                                      </>
                                    )
                                    : <Typography variant='caption' sx={{ color: 'text.secondary' }}>{renderer.title || '-'}</Typography>}
                                </TableCell>
                                <TableCell>
                                  <Chip label={renderer.type} size='small' />
                                </TableCell>
                                <TableCell>
                                  {renderer.private_KB > 0
                                    ? (
                                      <Typography
                                        variant='body2'
                                        color={renderer.private_KB > 500_000 ? 'error' : renderer.private_KB > 200_000 ? 'warning.main' : 'success.main'}
                                        sx={{ fontWeight: 'bold' }}
                                      >
                                        {`${Math.round(renderer.private_KB / 1024)} MB`}
                                      </Typography>
                                    )
                                    : renderer.workingSet_KB > 0
                                    ? (
                                      <Typography
                                        variant='body2'
                                        color={renderer.workingSet_KB > 500_000 ? 'error' : renderer.workingSet_KB > 200_000 ? 'warning.main' : 'success.main'}
                                        sx={{ fontWeight: 'bold' }}
                                      >
                                        {`~${Math.round(renderer.workingSet_KB / 1024)} MB`}
                                      </Typography>
                                    )
                                    : <Typography variant='caption' sx={{ color: 'text.secondary' }}>-</Typography>}
                                </TableCell>
                                <TableCell>
                                  {renderer.cpu_percent >= 0
                                    ? (
                                      <Typography
                                        variant='body2'
                                        color={renderer.cpu_percent > 20 ? 'error' : renderer.cpu_percent > 5 ? 'warning.main' : 'text.primary'}
                                        sx={{ fontWeight: 'bold' }}
                                      >
                                        {`${renderer.cpu_percent.toFixed(1)} %`}
                                      </Typography>
                                    )
                                    : <Typography variant='caption' sx={{ color: 'text.secondary' }}>-</Typography>}
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
                            <Typography sx={{ color: 'text.secondary' }}>{t('Preference.ProcessInfoRenderersEmpty')}</Typography>
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

export function DeveloperExternalApiItem({ onNeedsRestart }: ICustomItemProps): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [externalApiInfo, setExternalApiInfo] = useState<{ exists: boolean; size?: number; path?: string }>({ exists: false });

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const info = await window.service.database.getDatabaseInfo('externalApi');
        const path = await window.service.database.getDatabasePath('externalApi');
        setExternalApiInfo({ ...info, path });
      } catch (error) {
        void window.service.native.log('error', 'DeveloperExternalApiItem: fetch externalApi database info failed', {
          function: 'DeveloperExternalApiItem.fetchInfo',
          error,
        });
      }
    };
    void fetchInfo();
  }, []);

  return (
    <>
      <ListItem
        secondaryAction={
          <Switch
            edge='end'
            checked={preference?.externalAPIDebug || false}
            disabled={preference === undefined}
            onChange={async () => {
              await window.service.preference.set('externalAPIDebug', !preference?.externalAPIDebug);
              const info = await window.service.database.getDatabaseInfo('externalApi');
              if (!info?.exists) {
                onNeedsRestart();
              }
            }}
            name='externalAPIDebug'
          />
        }
      >
        <ListItemText
          primary={t('Preference.ExternalAPIDebug', { ns: 'agent' })}
          secondary={t('Preference.ExternalAPIDebugDescription', { ns: 'agent' })}
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
                  void window.service.native.log('error', 'DeveloperExternalApiItem: open externalApi database folder failed', {
                    function: 'DeveloperExternalApiItem.openExternalApiDatabaseFolder',
                    error,
                    path: externalApiInfo.path,
                  });
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
                size: externalApiInfo.size ? `${(externalApiInfo.size / 1024 / 1024).toFixed(2)} MB` : t('Unknown'),
              })}
            />
            <ChevronRightIcon color='action' />
          </ListItemButton>
        </>
      )}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
        }}
      >
        <DialogTitle>{t('Preference.ConfirmDelete')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('Preference.ConfirmDeleteExternalApiDatabase')}</DialogContentText>
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
            color='error'
            onClick={async () => {
              try {
                await window.service.database.deleteDatabase('externalApi');
                setDeleteDialogOpen(false);
                const info = await window.service.database.getDatabaseInfo('externalApi');
                const path = await window.service.database.getDatabasePath('externalApi');
                setExternalApiInfo({ ...info, path });
              } catch (error) {
                void window.service.native.log('error', 'DeveloperExternalApiItem: delete externalApi database failed', {
                  function: 'DeveloperExternalApiItem.handleDelete',
                  error,
                });
              }
            }}
          >
            {t('Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
