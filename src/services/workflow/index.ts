/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable unicorn/consistent-destructuring */
import { Graph as FbpGraph } from 'fbp-graph';
import { loadJSON } from 'fbp-graph/lib/Graph';
import { injectable } from 'inversify';
import { ComponentLoader, createNetwork } from 'noflo';
import { Network as NofloNetwork } from 'noflo/lib/Network';

import { WikiChannel } from '@/constants/channels';
import { getInfoFromTidGiUrl, getTiddlerTidGiUrl } from '@/constants/urls';
import { getBrowserComponentLibrary } from '@/pages/Workflow/GraphEditor/utils/library';
import { lazyInject } from '@services/container';
import { WorkflowNetwork, WorkflowRunningState } from '@services/database/entity/WorkflowNetwork';
import { IDatabaseService } from '@services/database/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import { IWikiService } from '@services/wiki/interface';
import type { IGraphInfo, INetworkState, INetworkClientToServerUpdate, IWorkflowService, INetworkServerToClientUpdate } from './interface';
import { BehaviorSubject } from 'rxjs';

@injectable()
export class WorkflowService implements IWorkflowService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  public networks: Record<string, NofloNetwork | undefined>;
  public networkStates: Record<string, INetworkState | undefined>;

  constructor() {
    this.networks = {};
    this.networkStates = {};
  }

  private _componentLoader?: ComponentLoader;

  private async initLibrary() {
    const [libraryToLoad, componentLoader] = await getBrowserComponentLibrary();
    this._componentLoader = componentLoader;
    return [libraryToLoad, componentLoader] as const;
  }

  private get componentLoader(): Promise<ComponentLoader> {
    if (this._componentLoader !== undefined) {
      return Promise.resolve(this._componentLoader);
    }
    return this.initLibrary().then(([, componentLoader]) => componentLoader);
  }

  public async startWorkflows(): Promise<void> {
    const appDatabase = await this.databaseService.getAppDatabase();
    const workflowNetworkRow = await appDatabase.getRepository(WorkflowNetwork).find({ where: { runningState: WorkflowRunningState.Running } });
    await Promise.all(workflowNetworkRow.map(async (row) => {
      const graphInfo = await this.getFbpGraphStringFromURI(row.graphURI);
      await this.deserializeNetworkAndAdd({ ...graphInfo, network: { id: row.id, serializedState: row.serializedState, runningState: row.runningState } }, { start: true });
    }));
  }

  public async addNetworkFromGraphTiddlerTitle(workspaceID: string, graphTiddlerTitle: string): Promise<string> {
    const fbpGraphString = await this.wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, workspaceID, [graphTiddlerTitle]);
    const graphInfo = { graphTiddlerTitle, workspaceID, fbpGraphString };
    const { id } = await this.deserializeNetworkAndAdd(graphInfo, { start: true });
    return id;
  }

  /**
   * subscribe to the network outcome, to see if we need to update the UI elements
   * @param networkID The chat ID
   */
  public subscribeNetworkActions$(networkID: string): BehaviorSubject<INetworkServerToClientUpdate> {
    const network = this.networks[networkID];
    if (network === undefined) throw new Error('Network not found');
    const networkState = this.networkStates[networkID];
    if (networkState === undefined) throw new Error('Network state not found');
    const networkUIStoreUpdateMessage$ = new BehaviorSubject<INetworkServerToClientUpdate>({
      type: 'updateNetwork',
      payload: {
        networkID,
        networkState,
      },
    });
    network.on('addedge', (edge) => {
      networkUIStoreUpdateMessage$.next({
        type: 'addEdge',
        payload: {
          networkID,
          edge,
        },
      });
    });
    return networkUIStoreUpdateMessage$;
  }

  public async triggerNetworkActions(networkID: string, action: INetworkClientToServerUpdate): Promise<void> {

  }

  public async deserializeNetworkAndAdd(
    graphInfo: IGraphInfo,
    options?: { start?: boolean },
  ): Promise<{ id: string; network: NofloNetwork }> {
    const { workspaceID, graphTiddlerTitle, fbpGraphString, network } = graphInfo;
    const fbpGraph: FbpGraph = await loadJSON(fbpGraphString);
    /**
     * Similar to noflo-runtime-base's `src/protocol/Network.js`, transform FbpGraph to ~~NofloGraph~~ Network
     */
    const newNofloNetwork: NofloNetwork = await createNetwork(fbpGraph, {
      subscribeGraph: false,
      delay: true,
      componentLoader: await this.componentLoader,
    });
    newNofloNetwork.on('process-error', (processError: { error: Error }) => {
      if (typeof console.error === 'function') {
        console.error(processError.error);
      } else {
        console.log(processError.error);
      }
    });
    // node's initial data already being added by UI in src/pages/Workflow/GraphEditor/components/NodeDetailPanel.tsx
    await newNofloNetwork.connect();
    injectUIEffectsWhenRunGraph(newNofloNetwork);
    /** Normally we get the graphInfo from database, so we have ID here. */
    let networkID = network?.id;
    // but if network ID is not provided, means it is a new one  generate a new row for it in the database
    if (networkID === undefined) {
      const appDatabase = await this.databaseService.getAppDatabase();
      // Add to the db and generate a new id by database
      const workflowNetworkRow = await appDatabase.getRepository(WorkflowNetwork).save({
        graphURI: getTiddlerTidGiUrl(workspaceID, graphTiddlerTitle),
        runningState: WorkflowRunningState.Idle,
      });
      networkID = workflowNetworkRow.id;
    }
    // put the new network to memory, keep it running.
    this.networks[networkID] = newNofloNetwork;
    if (options?.start !== false) {
      await this.startNetwork(networkID);
    }
    return { network: newNofloNetwork, id: networkID };
  }

  public serializeNetwork(networkID: string): string {
    const network = this.networks[networkID];
    if (network === undefined) throw new Error('Network not found');
    return JSON.stringify(network.graph.toJSON());
  }

  public async getFbpGraphStringFromURI(graphURI: string): Promise<{ fbpGraphString: string; graphTiddlerTitle: string; workspaceID: string }> {
    const { tiddlerTitle: graphTiddlerTitle, workspaceID } = getInfoFromTidGiUrl(graphURI);
    const fbpGraphString = await this.wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, workspaceID, [graphTiddlerTitle]);
    return { graphTiddlerTitle, workspaceID, fbpGraphString };
  }

  public async startNetwork(networkID: string): Promise<void> {
    const appDatabase = await this.databaseService.getAppDatabase();
    const workflowNetworkRow = await appDatabase.getRepository(WorkflowNetwork).findOneOrFail({ where: { id: networkID } });
    if (workflowNetworkRow === undefined) throw new Error(`Network ${networkID} not found in database`);
    const network = this.networks[networkID];
    if (network === undefined) throw new Error(`Network ${networkID} not found in Workflow Service, did you call deserializeNetworkAndAdd ?`);
    await network.start();
    network.once('end', () => {
      // update database to set it state to idle
      void appDatabase.getRepository(WorkflowNetwork).update({ id: networkID }, { runningState: WorkflowRunningState.Idle });
    });
    // set state to running in database
    await appDatabase.getRepository(WorkflowNetwork).update({ id: networkID }, { runningState: WorkflowRunningState.Running });
  }

  public async stopNetwork(networkID: string): Promise<void> {
    const network = this.networks[networkID];
    if (network === undefined) throw new Error('Network not found');
    await network.stop();
    const appDatabase = await this.databaseService.getAppDatabase();
    // TODO: also save its `serializedState` to database
    await appDatabase.getRepository(WorkflowNetwork).update({ id: networkID }, { runningState: WorkflowRunningState.Idle });
  }

  public listNetworks() {
    return Object.entries(this.networks).filter((item): item is [string, NofloNetwork] => item[1] !== undefined);
  }
}
