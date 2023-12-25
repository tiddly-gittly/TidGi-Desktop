/* eslint-disable unicorn/no-null */
import { Button, Menu, MenuItem } from '@mui/material';
import { WindowNames } from '@services/windows/WindowProperties';
import React, { useState } from 'react';
import { styled } from 'styled-components';

const StyledGridItem = styled.div`
  // Add styles for your grid item here
`;

interface HelpWebsiteItemProps {
  item: {
    description: string;
    fallbackUrls: string[];
    title: string;
    url: string;
  };
}

export const HelpWebsiteItem: React.FC<HelpWebsiteItemProps> = ({ item }) => {
  const [anchorElement, setAnchorElement] = useState<null | HTMLElement>(null);

  const openExternalLink = (uri: string) => {
    void window.service.window.open(WindowNames.any, { uri });
  };

  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorElement(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorElement(null);
  };

  return (
    <StyledGridItem>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <Button
        onClick={() => {
          openExternalLink(item.url);
        }}
      >
        Open
      </Button>
      {item.fallbackUrls.length > 0 && (
        <>
          <Button
            aria-controls='fallback-menu'
            aria-haspopup='true'
            onClick={handleOpenMenu}
          >
            Alternatives
          </Button>
          <Menu
            id='fallback-menu'
            anchorEl={anchorElement}
            keepMounted
            open={Boolean(anchorElement)}
            onClose={handleCloseMenu}
          >
            {item.fallbackUrls.map((url, index) => (
              <MenuItem
                key={index}
                onClick={() => {
                  openExternalLink(url);
                }}
              >
                {new URL(url).hostname}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </StyledGridItem>
  );
};
