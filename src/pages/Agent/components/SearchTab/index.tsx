import React from 'react';
import { useLocation } from 'wouter';
import { styled } from 'styled-components';
import { useTranslation } from 'react-i18next';

const SearchButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 10px 15px;
  width: 100%;
  border: none;
  background-color: transparent;
  border-bottom: 1px solid ${props => props.theme.palette.divider};
  cursor: pointer;
  color: ${props => props.theme.palette.text.primary};
  &:hover {
    background-color: ${props => props.theme.palette.action.hover};
  }
`;

const SearchIcon = styled.span`
  margin-right: 10px;
  font-size: 18px;
`;

export const SearchTab: React.FC = () => {
  const { t } = useTranslation('agent');
  const [, setLocation] = useLocation();

  const handleOpenSearch = () => {
    setLocation('/search');
  };

  return (
    <SearchButton onClick={handleOpenSearch}>
      <SearchIcon>🔍</SearchIcon>
      {t('Search.Title', '搜索标签页')}
    </SearchButton>
  );
};