import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { styled } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const Panel = styled(Box)`
  padding: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const TabsWrapper = styled(Box)`
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  padding: 0 16px;
`;

const ContentWrapper = styled(Box)`
  flex: 1;
  overflow: auto;
  padding: 16px;
`;

const EmptyState = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${({ theme }) => theme.palette.text.secondary};
`;

const DiffContainer = styled(Box)`
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-break: break-all;
  background-color: ${({ theme }) => theme.palette.mode === 'dark' ? '#0d1117' : '#f6f8fa'};
  border-radius: 4px;
  overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.palette.divider};
`;

const FileContentContainer = styled(Box)`
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.875rem;
  white-space: pre;
  background-color: ${({ theme }) => theme.palette.mode === 'dark' ? '#0d1117' : '#f6f8fa'};
  padding: 12px;
  border-radius: 4px;
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  color: ${({ theme }) => theme.palette.text.primary};
`;

const DiffLine = styled('div')<{ $type: 'added' | 'removed' | 'context' | 'header' }>`
  ${({ $type, theme }) => {
  const isDark = theme.palette.mode === 'dark';
  switch ($type) {
    case 'added':
      return isDark
        ? `
          background-color: rgba(46, 160, 67, 0.2);
          color: #7ee787;
          border-left: 3px solid #3fb950;
        `
        : `
          background-color: rgba(46, 160, 67, 0.15);
          color: #116329;
          border-left: 3px solid #2da44e;
        `;
    case 'removed':
      return isDark
        ? `
          background-color: rgba(248, 81, 73, 0.2);
          color: #ffa198;
          border-left: 3px solid #f85149;
        `
        : `
          background-color: rgba(248, 81, 73, 0.15);
          color: #82071e;
          border-left: 3px solid #cf222e;
        `;
    case 'header':
      return isDark
        ? `
          background-color: rgba(56, 139, 253, 0.15);
          color: #79c0ff;
          font-weight: 600;
          border-left: 3px solid #388bfd;
        `
        : `
          background-color: rgba(56, 139, 253, 0.15);
          color: #0969da;
          font-weight: 600;
          border-left: 3px solid #0969da;
        `;
    default:
      return `
          color: ${theme.palette.text.secondary};
          border-left: 3px solid transparent;
        `;
  }
}}
  padding: 2px 4px 2px 8px;
  min-height: 20px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  line-height: 1.5;
`;

const ImageComparisonWrapper = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ImageBox = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ImagePreview = styled('img')`
  max-width: 100%;
  height: auto;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 4px;
`;

interface IFileDiffPanelProps {
  commitHash: string;
  filePath: string | null;
  workspaceID: string;
  onDiscardSuccess?: () => void;
  showSnackbar?: (message: string, severity: 'success' | 'error' | 'info') => void;
}

export function FileDiffPanel({ commitHash, filePath, workspaceID, onDiscardSuccess, showSnackbar: showSnackbarFromParent }: IFileDiffPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [diff, setDiff] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isImage, setIsImage] = useState(false);
  const [currentTab, setCurrentTab] = useState<'diff' | 'content' | 'actions'>('diff');
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [previousImageDataUrl, setPreviousImageDataUrl] = useState<string>('');
  const [imageError, setImageError] = useState<string>('');
  const [isDiffTruncated, setIsDiffTruncated] = useState(false);
  const [isContentTruncated, setIsContentTruncated] = useState(false);
  const [isLoadingFullDiff, setIsLoadingFullDiff] = useState(false);
  const [isLoadingFullContent, setIsLoadingFullContent] = useState(false);

  // Use parent's showSnackbar if provided, otherwise create local one
  const showSnackbar = showSnackbarFromParent ?? (() => {});

  const getWorkspace = async () => {
    const workspace = await window.service.workspace.get(workspaceID);
    if (!workspace || !('wikiFolderLocation' in workspace)) return null;
    return workspace;
  };

  const loadFullDiff = async () => {
    if (!filePath || !commitHash) return;

    setIsLoadingFullDiff(true);
    try {
      const workspace = await getWorkspace();
      if (!workspace) return;

      // Load full diff without limits (pass very large values)
      const fileDiffResult = await window.service.git.callGitOp('getFileDiff', workspace.wikiFolderLocation, commitHash, filePath, 50000, 1000000);
      setDiff(fileDiffResult.content);
      setIsDiffTruncated(fileDiffResult.isTruncated);
    } catch (error) {
      console.error('Failed to load full diff:', error);
    } finally {
      setIsLoadingFullDiff(false);
    }
  };

  const canDiscardChanges = !commitHash;
  const extensionMatch = filePath ? filePath.match(/\.([^.\\/]+)$/) : null;
  const fileExtension = extensionMatch?.[1] ?? null;

  const handleDiscardChanges = async () => {
    if (!filePath || !canDiscardChanges) return;
    const workspace = await getWorkspace();
    if (!workspace) return;

    try {
      await window.service.git.discardFileChanges(workspace.wikiFolderLocation, filePath);
      showSnackbar(t('GitLog.DiscardSuccess'), 'success');
      // Clear selection and trigger refresh
      onDiscardSuccess?.();
    } catch (error) {
      console.error('Failed to discard changes:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showSnackbar(t('GitLog.DiscardFailed') + ': ' + errorMessage, 'error');
    }
  };

  const handleIgnoreFile = async () => {
    if (!filePath) return;
    const workspace = await getWorkspace();
    if (!workspace) return;

    try {
      await window.service.git.addToGitignore(workspace.wikiFolderLocation, filePath);
      showSnackbar(t('GitLog.IgnoreSuccess'), 'success');
      // Trigger refresh after adding to .gitignore
      onDiscardSuccess?.();
    } catch (error) {
      console.error('Failed to add to .gitignore:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showSnackbar(t('GitLog.IgnoreFailed') + ': ' + errorMessage, 'error');
    }
  };

  const handleIgnoreExtension = async () => {
    if (!filePath || !fileExtension) return;
    const workspace = await getWorkspace();
    if (!workspace) return;

    try {
      await window.service.git.addToGitignore(workspace.wikiFolderLocation, `*.${fileExtension}`);
      showSnackbar(t('GitLog.IgnoreSuccess'), 'success');
      // Trigger refresh after adding to .gitignore
      onDiscardSuccess?.();
    } catch (error) {
      console.error('Failed to add extension to .gitignore:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showSnackbar(t('GitLog.IgnoreFailed') + ': ' + errorMessage, 'error');
    }
  };

  const handleCopyPath = async () => {
    if (!filePath) return;
    const workspace = await getWorkspace();
    if (!workspace) return;

    const fullPath = `${workspace.wikiFolderLocation}/${filePath}`;
    await navigator.clipboard.writeText(fullPath);
    showSnackbar(t('GitLog.CopySuccess'), 'success');
  };

  const handleCopyRelativePath = async () => {
    if (!filePath) return;
    await navigator.clipboard.writeText(filePath);
    showSnackbar(t('GitLog.CopySuccess'), 'success');
  };

  const handleShowInExplorer = async () => {
    if (!filePath) return;
    const workspace = await getWorkspace();
    if (!workspace) return;

    const fullPath = `${workspace.wikiFolderLocation}/${filePath}`;
    await window.service.native.openPath(fullPath, true);
  };

  const handleOpenInEditor = async () => {
    if (!filePath) return;
    const workspace = await getWorkspace();
    if (!workspace) return;

    const fullPath = `${workspace.wikiFolderLocation}/${filePath}`;
    await window.service.native.openInEditor(fullPath);
  };

  const handleOpenWithDefault = async () => {
    if (!filePath) return;
    const workspace = await getWorkspace();
    if (!workspace) return;

    const fullPath = `${workspace.wikiFolderLocation}/${filePath}`;
    await window.service.native.openPath(fullPath, false);
  };

  const loadFullContent = async () => {
    if (!filePath || !commitHash) return;

    setIsLoadingFullContent(true);
    try {
      const workspace = await getWorkspace();
      if (!workspace) return;

      // Load full content without limits (pass very large values)
      const fileContentResult = await window.service.git.callGitOp('getFileContent', workspace.wikiFolderLocation, commitHash, filePath, 50000, 1000000);
      setFileContent(fileContentResult.content);
      setIsContentTruncated(fileContentResult.isTruncated);
    } catch (error) {
      console.error('Failed to load full content:', error);
    } finally {
      setIsLoadingFullContent(false);
    }
  };

  useEffect(() => {
    // Note: commitHash can be empty string for uncommitted changes, which is valid
    if (!filePath || commitHash === null || commitHash === undefined) {
      setDiff('');
      setFileContent('');
      setImageDataUrl('');
      setPreviousImageDataUrl('');
      setImageError('');
      setIsDiffTruncated(false);
      setIsContentTruncated(false);
      return;
    }

    const loadFileData = async () => {
      setLoading(true);
      try {
        const workspace = await getWorkspace();
        if (!workspace) return;

        // Check if file is an image or binary file
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];
        const isImageExtension = imageExtensions.some((extension) => filePath.toLowerCase().endsWith(extension));

        // First, try to get the diff to check if it's a binary file
        const fileDiffResult = await window.service.git.callGitOp('getFileDiff', workspace.wikiFolderLocation, commitHash, filePath);
        const isBinaryFile = fileDiffResult.content.includes('Binary files') || fileDiffResult.content.includes('differ');

        // Handle binary files
        if (isBinaryFile) {
          if (isImageExtension) {
            // Display image comparison for image files
            setIsImage(true);
            setImageError('');
            try {
              const imageComparison = await window.service.git.callGitOp('getImageComparison', workspace.wikiFolderLocation, commitHash, filePath);
              setImageDataUrl(imageComparison.current || '');
              setPreviousImageDataUrl(imageComparison.previous || '');
            } catch (error) {
              console.error('Failed to load image:', error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              setImageError(errorMessage);
            }
          } else {
            // Display binary file message for non-image binary files
            setIsImage(false);
            setDiff(t('GitLog.BinaryFileCannotDisplay'));
            setFileContent('');
          }
        } else {
          // For text files, get both diff and content
          setIsImage(false);
          const fileContentResult = await window.service.git.callGitOp('getFileContent', workspace.wikiFolderLocation, commitHash, filePath);
          setDiff(fileDiffResult.content);
          setFileContent(fileContentResult.content);
          setIsDiffTruncated(fileDiffResult.isTruncated);
          setIsContentTruncated(fileContentResult.isTruncated);
        }
      } catch (error) {
        console.error('Failed to load file data:', error);
        setDiff(t('GitLog.FailedToLoadDiff'));
        setFileContent('');
      } finally {
        setLoading(false);
      }
    };

    void loadFileData();
  }, [commitHash, filePath, t]);

  if (!filePath) {
    return (
      <Panel>
        <EmptyState>
          <Typography variant='body2'>{t('GitLog.SelectFileToViewDiff')}</Typography>
        </EmptyState>
      </Panel>
    );
  }

  if (loading) {
    return (
      <Panel>
        <EmptyState>
          <CircularProgress size={32} />
        </EmptyState>
      </Panel>
    );
  }

  // Render action buttons panel
  const renderActionsPanel = () => (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {canDiscardChanges && (
        <Button variant='outlined' color='warning' onClick={handleDiscardChanges} fullWidth>
          {t('GitLog.DiscardChanges')}
        </Button>
      )}
      <Button variant='outlined' onClick={handleIgnoreFile} fullWidth>
        {t('GitLog.IgnoreFile')}
      </Button>
      {fileExtension && (
        <Button variant='outlined' onClick={handleIgnoreExtension} fullWidth>
          {t('GitLog.IgnoreExtension', { ext: fileExtension })}
        </Button>
      )}
      <Button variant='outlined' onClick={handleCopyPath} fullWidth>
        {t('GitLog.CopyFilePath')}
      </Button>
      <Button variant='outlined' onClick={handleCopyRelativePath} fullWidth>
        {t('GitLog.CopyRelativeFilePath')}
      </Button>
      <Button variant='outlined' onClick={handleShowInExplorer} fullWidth>
        {t('GitLog.ShowInExplorer')}
      </Button>
      <Button variant='outlined' onClick={handleOpenInEditor} fullWidth>
        {t('GitLog.OpenInExternalEditor')}
      </Button>
      <Button variant='outlined' onClick={handleOpenWithDefault} fullWidth>
        {t('GitLog.OpenWithDefaultProgram')}
      </Button>
    </Box>
  );

  const renderTextPanelContent = () => {
    if (currentTab === 'actions') {
      return renderActionsPanel();
    }

    if (currentTab === 'diff') {
      return (
        <>
          {isDiffTruncated && (
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant='outlined'
                size='small'
                onClick={() => void loadFullDiff()}
                disabled={isLoadingFullDiff}
              >
                {isLoadingFullDiff ? t('GitLog.LoadingFull') : t('GitLog.ShowFull')}
              </Button>
            </Box>
          )}
          <DiffContainer>
            {renderDiffContent()}
          </DiffContainer>
        </>
      );
    }

    return (
      <>
        {isContentTruncated && (
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
            <Button
              variant='outlined'
              size='small'
              onClick={() => void loadFullContent()}
              disabled={isLoadingFullContent}
            >
              {isLoadingFullContent ? t('GitLog.LoadingFull') : t('GitLog.ShowFull')}
            </Button>
          </Box>
        )}
        <FileContentContainer>
          {fileContent}
        </FileContentContainer>
      </>
    );
  };

  if (isImage) {
    return (
      <Panel>
        <TabsWrapper>
          <Typography variant='h6' sx={{ pt: 2, pb: 1 }}>
            {filePath}
          </Typography>
          <Tabs
            value={currentTab}
            onChange={(_event, newValue: 'diff' | 'content' | 'actions') => {
              setCurrentTab(newValue);
            }}
          >
            <Tab label={t('GitLog.DiffView')} value='diff' />
            <Tab label={t('GitLog.ContentView')} value='content' />
            <Tab label={t('GitLog.Actions')} value='actions' />
          </Tabs>
        </TabsWrapper>
        <ContentWrapper>
          {currentTab === 'diff' && (
            <ImageComparisonWrapper>
              {/* Show previous image if available */}
              {previousImageDataUrl && (
                <ImageBox>
                  <Typography variant='subtitle2'>{t('GitLog.PreviousVersion')}</Typography>
                  <ImagePreview
                    src={previousImageDataUrl}
                    alt={`${filePath} (previous)`}
                    onError={() => {
                      setPreviousImageDataUrl('');
                    }}
                  />
                </ImageBox>
              )}
              {/* Show current image */}
              <ImageBox>
                <Typography variant='subtitle2'>
                  {previousImageDataUrl ? t('GitLog.CurrentVersion') : t('GitLog.ImageInCommit')}
                </Typography>
                {imageDataUrl
                  ? (
                    <ImagePreview
                      src={imageDataUrl}
                      alt={filePath}
                      onError={() => {
                        setImageDataUrl('');
                        setImageError('Failed to render image');
                      }}
                    />
                  )
                  : imageError
                  ? (
                    <Box>
                      <Typography variant='body2' color='error' sx={{ mb: 1 }}>
                        {t('GitLog.ImageNotAvailable')}
                      </Typography>
                      <Typography variant='caption' color='textSecondary' sx={{ fontFamily: 'monospace' }}>
                        {imageError}
                      </Typography>
                    </Box>
                  )
                  : (
                    <Typography variant='body2' color='textSecondary'>
                      {previousImageDataUrl ? t('GitLog.NewImage') : t('GitLog.ImageNotAvailable')}
                    </Typography>
                  )}
              </ImageBox>
            </ImageComparisonWrapper>
          )}
          {currentTab === 'content' && imageDataUrl && (
            <ImageBox>
              <ImagePreview
                src={imageDataUrl}
                alt={filePath}
                onError={() => {
                  setImageDataUrl('');
                  setImageError('Failed to render image');
                }}
              />
            </ImageBox>
          )}
          {currentTab === 'actions' && renderActionsPanel()}
        </ContentWrapper>
      </Panel>
    );
  }

  // Parse diff into lines with colors
  const renderDiffContent = () => {
    const lines = diff.split('\n');
    const renderDiffLine = (line: string, index: number) => {
      let type: 'added' | 'removed' | 'context' | 'header' = 'context';

      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
        type = 'header';
      } else if (line.startsWith('+')) {
        type = 'added';
      } else if (line.startsWith('-')) {
        type = 'removed';
      }

      return (
        <DiffLine key={index} $type={type}>
          {line || ' '}
        </DiffLine>
      );
    };

    return lines.map((line, index) => renderDiffLine(line, index));
  };

  return (
    <Panel>
      <TabsWrapper>
        <Typography variant='h6' sx={{ pt: 2, pb: 1 }}>
          {filePath}
        </Typography>
        <Tabs
          value={currentTab}
          onChange={(_event, newValue: 'diff' | 'content' | 'actions') => {
            setCurrentTab(newValue);
          }}
        >
          <Tab label={t('GitLog.DiffView')} value='diff' />
          <Tab label={t('GitLog.ContentView')} value='content' />
          <Tab label={t('GitLog.Actions')} value='actions' />
        </Tabs>
      </TabsWrapper>

      <ContentWrapper>{renderTextPanelContent()}</ContentWrapper>
    </Panel>
  );
}
