import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

import CircularProgress from '@material-ui/core/CircularProgress';
import Grid from '@material-ui/core/Grid';
import BottomNavigation from '@material-ui/core/BottomNavigation';
import BottomNavigationAction from '@material-ui/core/BottomNavigationAction';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';

import SearchIcon from '@material-ui/icons/Search';
import ViewListIcon from '@material-ui/icons/ViewList';
import CreateIcon from '@material-ui/icons/Create';

import InfiniteLoader from 'react-window-infinite-loader';
import { FixedSizeList } from 'react-window';

import connectComponent from '../../helpers/connect-component';

import { requestOpenInBrowser } from '../../senders';

import { getHits, updateMode, updateScrollOffset } from '../../state/dialog-add-workspace/actions';

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
    padding: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
    position: 'relative',
  },
  grid: {
    marginBottom: theme.spacing(1),
  },
  searchByAlgoliaContainer: {
    marginTop: theme.spacing(1.5),
    marginBottom: theme.spacing(1.5),
    outline: 'none',
    width: '100%',
    textAlign: 'center',
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
  homeContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  cardContainer: {
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
  },
  contentContainer: {
    padding: theme.spacing(1),
  },
});

const AddWorkspace = ({
  classes,
  currentQuery,
  hasFailed,
  hits,
  isGetting,
  mode,
  onGetHits,
  onUpdateMode,
  onUpdateScrollOffset,
  page,
  scrollOffset,
  shouldUseDarkColors,
  totalPage,
}) => {
  useEffect(() => {
    onGetHits();
  }, [onGetHits]);

  const renderContent = () => {
    if (hasFailed) {
      return (
        <div className={classes.contentContainer}>
          <NoConnection
            onTryAgainButtonClick={onGetHits}
          />
        </div>
      );
    }

    if (!isGetting && hits.length < 1) {
      return (
        <EmptyState icon={SearchIcon} title="No Matching Results">
          <Grid container justify="center" spacing={2}>
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

    const Row = ({ index, style }) => {
      if (index === hits.length) {
        if (isGetting) return null;
        return (
          <div className={classes.cardContainer} style={{ ...style, height: 'auto', paddingTop: 8 }}>
            <SubmitAppCard />
            <div
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                requestOpenInBrowser('https://algolia.com');
              }}
              onClick={() => requestOpenInBrowser('https://algolia.com')}
              role="link"
              tabIndex="0"
              className={classes.searchByAlgoliaContainer}
            >
              <img
                src={shouldUseDarkColors ? searchByAlgoliaDarkSvg : searchByAlgoliaLightSvg}
                alt="Search by Algolia"
                className={classes.searchByAlgolia}
              />
            </div>
          </div>
        );
      }
      Row.propTypes = {
        index: PropTypes.number.isRequired,
        style: PropTypes.object.isRequired,
      };

      const app = hits[index];
      return (
        <div className={classes.cardContainer} style={style}>
          <AppCard
            key={app.id}
            id={app.id}
            name={app.name}
            url={app.url}
            icon={app.icon}
            icon128={app.icon128}
          />
        </div>
      );
    };

    const hasNextPage = page + 1 < totalPage;
    const itemCount = hits.length + 1;
    // Every row is loaded except for our loading indicator row.
    const isItemLoaded = (index) => !hasNextPage || index < hits.length;
    return (
      <InfiniteLoader
        isItemLoaded={isItemLoaded}
        itemCount={hits.length + 1}
        loadMoreItems={onGetHits}
      >
        {({ onItemsRendered, ref }) => (
          <FixedSizeList
            height={window.innerHeight - 80} // total height - search bar (40) - bottom nav (40)
            itemCount={itemCount}
            itemSize={60}
            initialScrollOffset={scrollOffset}
            width="100%"
            onItemsRendered={onItemsRendered}
            onScroll={(position) => {
              onUpdateScrollOffset(position.scrollOffset || 0);
            }}
            ref={ref}
          >
            {Row}
          </FixedSizeList>
        )}
      </InfiniteLoader>
    );
  };

  return (
    <div className={classes.root}>
      {mode === 'catalog' && (
        <div className={classes.homeContainer}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <SearchBox />
            </Grid>
          </Grid>
          <div
            className={classes.scrollContainer}
          >
            <Grid container className={classes.grid} spacing={2}>
              <Grid item xs={12}>
                {renderContent()}
              </Grid>
            </Grid>
            {isGetting && (
              <div style={{ position: 'absolute', bottom: 8, right: 8 }}>
                <CircularProgress size={28} />
              </div>
            )}
          </div>
        </div>
      )}
      {mode === 'custom' && <Form />}

      <Paper elevation={1} square className={classes.paper}>
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
};

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
  onUpdateScrollOffset: PropTypes.func.isRequired,
  page: PropTypes.number.isRequired,
  scrollOffset: PropTypes.number.isRequired,
  shouldUseDarkColors: PropTypes.bool.isRequired,
  totalPage: PropTypes.number.isRequired,
};

const mapStateToProps = (state) => ({
  currentQuery: state.dialogAddWorkspace.currentQuery,
  hasFailed: state.dialogAddWorkspace.hasFailed,
  hits: state.dialogAddWorkspace.hits,
  isGetting: state.dialogAddWorkspace.isGetting,
  mode: state.dialogAddWorkspace.mode,
  page: state.dialogAddWorkspace.page,
  scrollOffset: state.dialogAddWorkspace.scrollOffset,
  shouldUseDarkColors: state.general.shouldUseDarkColors,
  totalPage: state.dialogAddWorkspace.totalPage,
});

const actionCreators = {
  getHits,
  updateMode,
  updateScrollOffset,
};

export default connectComponent(
  AddWorkspace,
  mapStateToProps,
  actionCreators,
  styles,
);
