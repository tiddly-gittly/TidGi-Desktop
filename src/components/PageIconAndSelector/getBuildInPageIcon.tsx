import AccountTreeIcon from '@material-ui/icons/AccountTree';
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
  }
}
