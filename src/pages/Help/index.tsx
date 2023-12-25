import { Grid } from '@mui/material';
import { HelpWebsiteItem } from './HelpWebsiteItem';
import { useLoadHelpPagesList } from './useLoadHelpPagesList';

export function Help(): JSX.Element {
  const items = useLoadHelpPagesList();
  return (
    <Grid container spacing={2}>
      {items.map((item, index) => (
        <Grid key={index} item xs={12} sm={6} md={4}>
          <HelpWebsiteItem item={item} />
        </Grid>
      ))}
    </Grid>
  );
}
