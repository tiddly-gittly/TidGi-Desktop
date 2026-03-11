import { WikiChannel } from '@/constants/channels';
import { Box, CircularProgress, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { WindowNames } from '@services/windows/WindowProperties';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IWikiEmbedTab } from '../../types/tab';

/** Props for the wiki embed tab content component */
interface WikiEmbedTabContentProps {
  /** Wiki embed tab data */
  tab: IWikiEmbedTab;
  /** Whether this is rendered in a split view (affects bounds calculation) */
  isSplitView?: boolean;
}

/** Container that will host the embedded wiki BrowserView */
const Container = styled(Box)`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
  background-color: transparent;
`;

/** Placeholder shown while loading */
const LoadingContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
`;

/**
 * Wiki Embed Tab Content Component
 * Embeds the existing Wiki BrowserView in the Agent page split view.
 * This component manages the BrowserView bounds to fit within its container.
 */
export const WikiEmbedTabContent: React.FC<WikiEmbedTabContentProps> = ({ tab, isSplitView = false }) => {
  const { t } = useTranslation('agent');
  const containerReference = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wake up the workspace if it was hibernated when navigation to the agent page triggered hibernation
  useEffect(() => {
    void window.service.workspaceView.wakeUpWorkspaceView(tab.workspaceId);
  }, [tab.workspaceId]);

  useEffect(() => {
    let mounted = true;

    const updateBrowserViewBounds = async () => {
      if (!containerReference.current || !mounted) return;

      try {
        // Get the container's position and size relative to the window
        const rect = containerReference.current.getBoundingClientRect();
        const bounds = {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };

        // Only update if bounds are valid (width and height > 0)
        if (bounds.width > 0 && bounds.height > 0) {
          void window.service.native.log('debug', 'WikiEmbedTabContent: setting bounds', {
            workspaceId: tab.workspaceId,
            bounds: JSON.stringify(bounds),
          });
          // Set custom bounds for the wiki BrowserView
          await window.service.view.setViewBounds(tab.workspaceId, WindowNames.main, bounds);

          // Close TiddlyWiki sidebar when wiki embed is ready in split view
          // This provides better focus on the chat interface
          if (mounted && isSplitView) {
            try {
              // Check if TiddlyWiki is ready by testing if we can access tiddlers
              const canAccessWiki = await window.service.wiki.wikiOperationInBrowser(WikiChannel.getTiddler, tab.workspaceId, [
                'Index',
              ]);

              if (canAccessWiki) {
                // Only set state if wiki is accessible - use addTiddler for immediate effect
                await window.service.wiki.wikiOperationInBrowser(WikiChannel.addTiddler, tab.workspaceId, [
                  '$:/state/sidebar',
                  'no',
                ]);
              }
            } catch (sideBarError) {
              void window.service.native.log('warn', 'WikiEmbedTabContent: failed to close sidebar', {
                workspaceId: tab.workspaceId,
                error: String(sideBarError),
              });
              // Non-critical error, don't throw
            }
          }

          if (mounted) {
            setIsLoading(false);
          }
        } else {
          // Bounds not ready yet, retry after a short delay (only if still mounted)
          void window.service.native.log('debug', 'WikiEmbedTabContent: bounds not ready, retrying...', {
            bounds: JSON.stringify(bounds),
          });
          if (mounted) {
            setTimeout(() => void updateBrowserViewBounds(), 100);
          }
        }
      } catch (error_) {
        if (mounted) {
          setError(String(error_));
          setIsLoading(false);
        }
      }
    };

    // Wait for layout to complete before measuring
    // Use requestAnimationFrame to ensure DOM has rendered
    requestAnimationFrame(() => {
      // Additional delay to ensure layout is stable
      setTimeout(() => void updateBrowserViewBounds(), 50);
    });

    // Update on resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        void updateBrowserViewBounds();
      } catch (error) {
        console.error('ResizeObserver callback failed', error);
      }
    });

    if (containerReference.current) {
      resizeObserver.observe(containerReference.current);
    }

    // Always clear custom bounds on unmount so the wiki view returns to normal
    // full-window layout.  showView() also clears them, but doing it here
    // handles the case where the component unmounts without a workspace switch
    // (e.g. tab closed while staying on the Agent page).
    return () => {
      mounted = false;
      resizeObserver.disconnect();
      void window.service.view.setViewBounds(tab.workspaceId, WindowNames.main, undefined).catch((error: unknown) => {
        console.error('Failed to cleanup WikiEmbedTabContent bounds', error);
      });
    };
  }, [tab.workspaceId, isSplitView]);

  if (error) {
    return (
      <Container>
        <LoadingContainer>
          <Typography color='error'>{t('WikiEmbed.Error')}</Typography>
          <Typography variant='body2' color='textSecondary'>{error}</Typography>
        </LoadingContainer>
      </Container>
    );
  }

  return (
    <Container ref={containerReference} data-testid='wiki-embed-view'>
      {isLoading && (
        <LoadingContainer>
          <CircularProgress size={32} />
          <Typography variant='body2' color='textSecondary'>
            {t('WikiEmbed.Loading')}
          </Typography>
        </LoadingContainer>
      )}
      {/* The BrowserView will be positioned here by the main process */}
    </Container>
  );
};
