import { Divider, Grid, Typography } from '@mui/material';
import { usePreferenceObservable } from '@services/preferences/hooks';
import { useTranslation } from 'react-i18next';
import { styled } from 'styled-components';
import { Languages } from '../Preferences/sections/Languages';
import { HelpWebsiteItem } from './HelpWebsiteItem';
import { useLoadHelpPagesList } from './useLoadHelpPagesList';

const InnerContentRoot = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding: 10px;
  width: 100%;
  height: 100%;
  overflow-y: auto;
`;
const StyledDivider = styled(Divider)`
  margin: 10px 0;
`;

export function Help(): React.JSX.Element {
  const { t } = useTranslation();
  const preference = usePreferenceObservable();
  const items = useLoadHelpPagesList(preference?.language);
  return (
    <>
      <Languages languageSelectorOnly />
      <InnerContentRoot>
        <Typography>{t('Help.Description')}</Typography>
        <StyledDivider>{t('Help.List')}</StyledDivider>
        <Grid container spacing={2}>
          {items.map((item, index) => (
            <Grid key={index} size={{ xs: 12, sm: 6, md: 4 }}>
              <HelpWebsiteItem item={item} />
            </Grid>
          ))}
        </Grid>
      </InnerContentRoot>
    </>
  );
}
