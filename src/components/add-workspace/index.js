import React from 'react';

import PropTypes from 'prop-types';

import Divider from '@material-ui/core/Divider';
import LinearProgress from '@material-ui/core/LinearProgress';
import Grid from '@material-ui/core/Grid';
import BottomNavigation from '@material-ui/core/BottomNavigation';
import BottomNavigationAction from '@material-ui/core/BottomNavigationAction';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';

import SearchIcon from '@material-ui/icons/Search';
import ViewListIcon from '@material-ui/icons/ViewList';
import CreateIcon from '@material-ui/icons/Create';

import connectComponent from '../../helpers/connect-component';

import { requestOpenInBrowser } from '../../senders';

import { getHits, updateMode } from '../../state/add-workspace/actions';
import { getShouldUseDarkMode } from '../../state/general/utils';

import AppCard from './app-card';
import SubmitAppCard from './submit-app-card';
import AddCustomAppCard from './add-custom-app-card';
import NoConnection from './no-connection';
import EmptyState from './empty-state';
import SearchBox from './search-box';
import Form from './form';

import searchByAlgoliaLightSvg from '../../images/search-by-algolia-light.svg';
import searchByAlgoliaDarkSvg from '../../images/search-by-algolia-dark.svg';


const styles = (theme) => ({
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  title: {
    flex: 1,
  },
  paper: {
    zIndex: 1,
  },
  scrollContainer: {
    flex: 1,
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
    paddingTop: theme.spacing(3),
    paddingBottom: theme.spacing(2),
    overflow: 'auto',
    boxSizing: 'border-box',
  },
  grid: {
    marginBottom: theme.spacing(1),
  },
  searchByAlgoliaContainer: {
    marginTop: theme.spacing(3),
    outline: 'none',
  },
  searchByAlgolia: {
    height: 20,
    cursor: 'pointer',
  },
  bottomNavigation: {
    height: 40,
  },
  bottomNavigationActionWrapper: {
    flexDirection: 'row',
  },
  bottomNavigationActionLabel: {
    fontSize: '0.8rem !important',
    paddingLeft: 4,
  },
});

class AddWorkspace extends React.Component {
  componentDidMount() {
    const { onGetHits } = this.props;

    onGetHits();

    const el = this.scrollContainer;
    el.onscroll = () => {
      const { isGetting, currentQuery, hits } = this.props;
      if (!isGetting && currentQuery.length > 0 && hits.length < 1) return; // no result
      // Plus 300 to run ahead.
      if (el.scrollTop + 300 >= el.scrollHeight - el.offsetHeight) {
        onGetHits();
      }
    };
  }

  render() {
    const {
      classes,
      currentQuery,
      hasFailed,
      hits,
      isGetting,
      mode,
      onGetHits,
      onUpdateMode,
      shouldUseDarkMode,
    } = this.props;

    const renderContent = () => {
      if (hasFailed) {
        return (
          <NoConnection
            onTryAgainButtonClick={onGetHits}
          />
        );
      }

      if (!isGetting && hits.length < 1) {
        return (
          <EmptyState icon={SearchIcon} title="No Matching Results">
            <Grid container justify="center" spacing={16}>
              <Grid item xs={12}>
                <Typography
                  variant="subtitle1"
                  align="center"
                >
                  Your search -&nbsp;
                  <b>{currentQuery}</b>
                  &nbsp;- did not match any apps in the catalog.
                </Typography>
              </Grid>
              <Grid item>
                <AddCustomAppCard />
              </Grid>
              <Grid item>
                <SubmitAppCard />
              </Grid>
            </Grid>
          </EmptyState>
        );
      }

      return (
        <>
          <Grid container justify="center" spacing={16}>
            {currentQuery && (
              <Grid item xs={12}>
                <Typography
                  variant="subtitle1"
                  align="left"
                  noWrap
                >
                  Search results for&nbsp;
                  <b>{currentQuery}</b>
                </Typography>
                <Divider className={classes.divider} />
              </Grid>
            )}
            {hits.map((app) => (
              <AppCard
                key={app.id}
                id={app.id}
                name={app.name}
                url={app.url}
                icon={app.icon}
                icon128={app.icon128}
              />
            ))}
            {!isGetting && <SubmitAppCard />}
          </Grid>

          {!isGetting && (
            <Grid container justify="center" spacing={16}>
              <div
                onKeyDown={() => requestOpenInBrowser('https://algolia.com')}
                onClick={() => requestOpenInBrowser('https://algolia.com')}
                role="link"
                tabIndex="0"
                className={classes.searchByAlgoliaContainer}
              >
                <img
                  src={shouldUseDarkMode ? searchByAlgoliaDarkSvg : searchByAlgoliaLightSvg}
                  alt="Search by Algolia"
                  className={classes.searchByAlgolia}
                />
              </div>
            </Grid>
          )}
        </>
      );
    };

    return (
      <div className={classes.root}>
        {mode === 'catalog' ? (
          <>
            <Grid container spacing={16}>
              <Grid item xs={12}>
                <SearchBox />
              </Grid>
            </Grid>
            <div
              className={classes.scrollContainer}
              ref={(container) => { this.scrollContainer = container; }}
            >
              <Grid container className={classes.grid} spacing={16}>
                <Grid item xs={12}>
                  {renderContent()}
                </Grid>
              </Grid>
              {isGetting && (<LinearProgress />)}
            </div>
          </>
        ) : <Form />}

        <Paper elevation={2} className={classes.paper}>
          <BottomNavigation
            showLabels
            value={mode}
            onChange={(e, value) => onUpdateMode(value)}
            classes={{ root: classes.bottomNavigation }}
          >
            <BottomNavigationAction
              label="Catalog"
              value="catalog"
              icon={<ViewListIcon />}
              classes={{
                wrapper: classes.bottomNavigationActionWrapper,
                label: classes.bottomNavigationActionLabel,
              }}
            />
            <BottomNavigationAction
              label="Custom Workspace"
              value="custom"
              icon={<CreateIcon />}
              classes={{
                wrapper: classes.bottomNavigationActionWrapper,
                label: classes.bottomNavigationActionLabel,
              }}
            />
          </BottomNavigation>
        </Paper>
      </div>
    );
  }
}

AddWorkspace.defaultProps = {
  currentQuery: '',
};

AddWorkspace.propTypes = {
  classes: PropTypes.object.isRequired,
  currentQuery: PropTypes.string,
  hasFailed: PropTypes.bool.isRequired,
  hits: PropTypes.arrayOf(PropTypes.object).isRequired,
  isGetting: PropTypes.bool.isRequired,
  mode: PropTypes.string.isRequired,
  onGetHits: PropTypes.func.isRequired,
  onUpdateMode: PropTypes.func.isRequired,
  shouldUseDarkMode: PropTypes.bool.isRequired,
};

const mapStateToProps = (state) => ({
  currentQuery: state.addWorkspace.currentQuery,
  hasFailed: state.addWorkspace.hasFailed,
  hits: state.addWorkspace.hits,
  isGetting: state.addWorkspace.isGetting,
  mode: state.addWorkspace.mode,
  shouldUseDarkMode: getShouldUseDarkMode(state),
});

const actionCreators = {
  getHits,
  updateMode,
};

export default connectComponent(
  AddWorkspace,
  mapStateToProps,
  actionCreators,
  styles,
);
