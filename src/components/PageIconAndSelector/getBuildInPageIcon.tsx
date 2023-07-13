import AccountTreeIcon from '@mui/icons-material/AccountTree';
import InfoIcon from '@mui/icons-material/Info';
import { PageType } from '@services/pages/interface';

export function getBuildInPageIcon(pageType: PageType): JSX.Element {
  switch (pageType) {
    case PageType.wiki: {
      // this won't happened, because wiki page is not a build-in page
      return <div>Wiki</div>;
    }
    case PageType.workflow: {
      return <AccountTreeIcon />;
    }
    case PageType.guide: {
      return <InfoIcon />;
    }
  }
  // don't return null here. If you get `Function lacks ending return statement and return type does not include 'undefined'.ts(2366)`, you must forget to provide an icon for a newly added page type here.
}
