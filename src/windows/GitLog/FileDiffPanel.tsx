import Box from '@mui/material/Box';
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
  switch ($type) {
    case 'added':
      return `
          background-color: rgba(46, 160, 67, 0.2);
          color: #7ee787;
          border-left: 3px solid #3fb950;
        `;
    case 'removed':
      return `
          background-color: rgba(248, 81, 73, 0.2);
          color: #ffa198;
          border-left: 3px solid #f85149;
        `;
    case 'header':
      return `
          background-color: rgba(56, 139, 253, 0.15);
          color: #79c0ff;
          font-weight: 600;
          border-left: 3px solid #388bfd;
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
}

export function FileDiffPanel({ commitHash, filePath }: IFileDiffPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [diff, setDiff] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isImage, setIsImage] = useState(false);
  const [currentTab, setCurrentTab] = useState<'diff' | 'content'>('diff');
  const [imageUrl, setImageUrl] = useState<string>('');

  useEffect(() => {
    if (!filePath || !commitHash) {
      setDiff('');
      setFileContent('');
      setImageUrl('');
      return;
    }

    const loadFileData = async () => {
      setLoading(true);
      try {
        const meta = window.meta();
        const workspaceID = (meta as { workspaceID?: string }).workspaceID;

        if (!workspaceID) return;

        const workspace = await window.service.workspace.get(workspaceID);
        if (!workspace || !('wikiFolderLocation' in workspace)) return;

        // Check if file is an image
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];
        const fileIsImage = imageExtensions.some((extension) => filePath.toLowerCase().endsWith(extension));
        setIsImage(fileIsImage);

        if (fileIsImage) {
          // For images, create a file:// URL to display the image
          const fullPath = `${workspace.wikiFolderLocation}/${filePath}`;
          setImageUrl(`file://${fullPath}`);
        } else {
          // Get the diff for this file
          const fileDiff = await window.service.git.getFileDiff(workspace.wikiFolderLocation, commitHash, filePath);
          setDiff(fileDiff);

          // Also get the file content (show command output)
          setFileContent(fileDiff);
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

  if (isImage) {
    return (
      <Panel>
        <TabsWrapper>
          <Typography variant='h6' sx={{ py: 2 }}>
            {filePath}
          </Typography>
        </TabsWrapper>
        <ContentWrapper>
          <ImageComparisonWrapper>
            <ImageBox>
              <Typography variant='subtitle2'>{t('GitLog.CurrentVersion')}</Typography>
              <ImagePreview
                src={imageUrl}
                alt={filePath}
                onError={() => {
                  setImageUrl('');
                }}
              />
            </ImageBox>
            <Typography variant='body2' color='textSecondary'>
              {t('GitLog.ImageDiffNote')}
            </Typography>
          </ImageComparisonWrapper>
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
          onChange={(_event, newValue: 'diff' | 'content') => {
            setCurrentTab(newValue);
          }}
        >
          <Tab label={t('GitLog.DiffView')} value='diff' />
          <Tab label={t('GitLog.ContentView')} value='content' />
        </Tabs>
      </TabsWrapper>

      <ContentWrapper>
        {currentTab === 'diff'
          ? (
            <DiffContainer>
              {renderDiffContent()}
            </DiffContainer>
          )
          : (
            <FileContentContainer>
              {fileContent}
            </FileContentContainer>
          )}
      </ContentWrapper>
    </Panel>
  );
}
