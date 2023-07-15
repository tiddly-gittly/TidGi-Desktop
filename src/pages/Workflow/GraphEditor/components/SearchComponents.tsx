import { sidebarWidth } from '@/constants/style';
import { Autocomplete, autocompleteClasses, AutocompleteRenderInputParams, Box, createFilterOptions, TextField } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type { IFBPLibrary, INoFloUIComponent } from 'the-graph';
import { NoFloIcon } from './NoFloIcon';
import { searchBarWidth } from './styleConstant';

const SearchBarWrapper = styled.div`
  position: absolute;
  left: ${sidebarWidth}px;
  top: 1em;
  z-index: 2;
  width: ${searchBarWidth}px;

  opacity: 0.3;
  &:hover {
    opacity: 1;
  }
  transition: opacity 0.3s ease-in-out;

  background-color: rgba(255,255,255,0.3);
  backdrop-filter: blur(10px);
`;
const SearchItemOptionText = styled.div`
  margin-left: 1em;
  display: flex;
  flex-direction: column;
`;

const ItemTitle = styled.h2`
  color: ${({ theme }) => theme.palette.text.primary};
  margin: 0;
  display: block;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow-x: hidden;
`;

const ItemDescription = styled.p`
  position: relative;
  display: block;
  left: 8px;
  padding: 0px;
  margin: 0px;
  line-height: calc(36px / 3);
  font-size: 10px;
  color: ${({ theme }) => theme.palette.text.secondary};
  text-shadow: ${({ theme }) => theme.palette.background.default} 0px 1px 1px;
`;

const filterOptions = createFilterOptions({
  stringify: (option: OptionType) => option.groupName + option.title,
});

interface OptionType {
  component: INoFloUIComponent;
  groupName: string;
  title: string;
}

interface SearchBarProps {
  addNode: (component: INoFloUIComponent) => void;
  library?: IFBPLibrary;
}

export function SearchComponents({ library, addNode }: SearchBarProps) {
  const [options, setOptions] = useState<OptionType[]>([]);
  const { t } = useTranslation();
  const components = useMemo(() => Object.values(library ?? {}), [library]);

  useEffect(() => {
    const newOptions = components.map(component => {
      const splitName = component.name.split('/');
      return {
        groupName: splitName[0],
        title: splitName[1] ?? component.name,
        component,
      };
    });
    setOptions(newOptions);
  }, [components]);

  return (
    <SearchBarWrapper>
      <Autocomplete
        options={options.sort((a, b) => -b.groupName.localeCompare(a.groupName))}
        groupBy={(option: OptionType) => option.groupName}
        getOptionLabel={(option: OptionType) => option.title}
        filterOptions={filterOptions}
        renderOption={(props, option: OptionType) => (
          <Box
            sx={{
              borderRadius: '8px',
              margin: '5px',
              [`&.${autocompleteClasses.option}`]: {
                padding: '8px',
              },
            }}
            component='li'
            {...props}
            onClick={() => {
              addNode(option.component);
            }}
          >
            <NoFloIcon icon={option.component.icon} />
            <SearchItemOptionText>
              <ItemTitle>{option.title}</ItemTitle>
              <ItemDescription>{option.component.description}</ItemDescription>
            </SearchItemOptionText>
          </Box>
        )}
        renderInput={(parameters: AutocompleteRenderInputParams) => <TextField {...parameters} label={t('Workflow.SearchComponents')} />}
      />
    </SearchBarWrapper>
  );
}
