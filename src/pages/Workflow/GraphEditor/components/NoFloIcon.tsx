/**
 * Generated from https://github.com/noflo/noflo-ui/blob/3c5451a8f4a9d7ab2a4fe7790729b0818d2d3c27/elements/noflo-icon.js
 * By ChatGPT4
 */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React from 'react';
import styled from 'styled-components';
import TheGraph from 'the-graph';

interface IconProps {
  fallback?: string;
  icon: string;
}

const iconMap = TheGraph.FONT_AWESOME;

const getIcon = (icon: string, fallback = 'cog'): string => {
  if (!iconMap) {
    return icon;
  }
  if (!iconMap[icon]) {
    if (!fallback) return fallback;
    return iconMap[fallback];
  }
  return iconMap[icon];
};

export const NoFloIcon: React.FC<IconProps> = ({ icon, fallback }) => {
  const displayIcon = getIcon(icon, fallback);

  return (
    <IconWrapper>
      {displayIcon}
    </IconWrapper>
  );
};

const IconWrapper = styled.span`
  display: inline-block;
  font: normal normal normal 14px/1 FontAwesome;
  font-size: inherit;
  text-rendering: auto;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
`;
