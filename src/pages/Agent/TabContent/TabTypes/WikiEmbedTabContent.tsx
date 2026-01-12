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
          await window.service.view.setViewCustomBounds(tab.workspaceId, WindowNames.main, bounds);
          if (mounted) {
            setIsLoading(false);
          }
        } else {
          // Bounds not ready yet, retry after a short delay
          void window.service.native.log('debug', 'WikiEmbedTabContent: bounds not ready, retrying...', {
            bounds: JSON.stringify(bounds),
          });
          setTimeout(() => void updateBrowserViewBounds(), 100);
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
      void updateBrowserViewBounds();
    });

    if (containerReference.current) {
      resizeObserver.observe(containerReference.current);
    }

    // Cleanup: only clear custom bounds if not switching to this wiki workspace
    return () => {
      mounted = false;
      resizeObserver.disconnect();

      // Check if we're switching to this wiki workspace
      // If so, don't clear bounds - let realignActiveView handle it
      void (async () => {
        const activeWorkspace = await window.service.workspace.getActiveWorkspace();
        if (activeWorkspace?.id !== tab.workspaceId) {
          // Only clear bounds if switching to a different workspace
          void window.service.view.setViewCustomBounds(tab.workspaceId, WindowNames.main, undefined);
        } else {
          // Switching to this wiki workspace, don't clear bounds
          void window.service.native.log('debug', 'WikiEmbedTabContent: not clearing bounds, switching to wiki workspace', {
            workspaceId: tab.workspaceId,
          });
        }
      })();
    };
  }, [tab.workspaceId, isSplitView]);

  if (error) {
    return (
      <Container>
        <LoadingContainer>
          <Typography color='error'>{t('WikiEmbed.Error', 'Failed to embed wiki')}</Typography>
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
            {t('WikiEmbed.Loading', 'Loading wiki...')}
          </Typography>
        </LoadingContainer>
      )}
      {/* The BrowserView will be positioned here by the main process */}
    </Container>
  );
};
