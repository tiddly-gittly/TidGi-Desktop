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
import { BehaviorSubject } from 'rxjs';
import { StoreApi } from 'zustand/vanilla';
import { injectContextWhenRunGraph } from './injectContextWhenRunGraph';
import type { IGraphInfo, INetworkState, IWorkflowService } from './interface';
import { getWorkflowViewModelStore, SingleChatState, WorkflowViewModelStoreState } from './viewModelStore';

@injectable()
export class WorkflowService implements IWorkflowService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  @lazyInject(serviceIdentifier.Wiki)
  private readonly wikiService!: IWikiService;

  public networks: Map<string, NofloNetwork | undefined>;
  /**
   * UI View Model that is sync with the client. Serialized to database when workflow is stopped. Deserialized from database when workflow is started.
   */
  public viewModelStores: Map<string, StoreApi<WorkflowViewModelStoreState>>;

  constructor() {
    this.networks = new Map();
    this.viewModelStores = new Map();
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
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      const state = JSON.parse(row.serializedState || '{}') as INetworkState;
      await this.deserializeNetworkAndAdd({ ...graphInfo, network: { id: row.id, state, runningState: row.runningState } }, { start: true });
    }));
  }

  public async addNetworkFromGraphTiddlerTitle(workspaceID: string, graphTiddlerTitle: string): Promise<{ id: string; state: INetworkState }> {
    const fbpGraphString = await this.wikiService.wikiOperationInServer(WikiChannel.getTiddlerText, workspaceID, [graphTiddlerTitle]);
    // TODO: save UI state in the tiddler, and get it here.
    const graphInfo = { graphTiddlerTitle, workspaceID, fbpGraphString };
    const { id, state } = await this.deserializeNetworkAndAdd(graphInfo, { start: true });
    return { id, state };
  }

  public getNetworkState(networkID: string, providedState?: Partial<INetworkState>): INetworkState {
    const network = this.networks.get(networkID);
    if (network === undefined) throw new Error('Network not found');
    let viewModel: SingleChatState;
    if ((providedState?.viewModel) === undefined) {
      const viewModelStore = this.viewModelStores.get(networkID);
      if (viewModelStore === undefined) throw new Error(`Network state (view model) not found for ${networkID}`);
      viewModel = viewModelStore.getState();
    } else {
      viewModel = providedState.viewModel;
    }
    return { viewModel };
  }

  public subscribeNetworkState$(networkID: string): BehaviorSubject<INetworkState> {
    const network = this.networks.get(networkID);
    if (network === undefined) throw new Error('Network not found');
    const viewModelStore = this.viewModelStores.get(networkID);
    if (viewModelStore === undefined) throw new Error(`Network state (view model) not found for ${networkID}`);
    const networkUIStoreUpdateMessage$ = new BehaviorSubject<INetworkState>(this.getNetworkState(networkID));
    viewModelStore.subscribe((state) => {
      networkUIStoreUpdateMessage$.next(this.getNetworkState(networkID, { viewModel: state }));
    });
    return networkUIStoreUpdateMessage$;
  }

  public async updateNetworkState(networkID: string, nextState: INetworkState): Promise<void> {
    const network = this.networks.get(networkID);
    if (network === undefined) throw new Error(`Network not found for ${networkID}`);
    const viewModelStore = this.viewModelStores.get(networkID);
    if (viewModelStore === undefined) throw new Error(`Network state (view model) not found for ${networkID}`);
    viewModelStore.setState(nextState.viewModel);
  }

  public async deserializeNetworkAndAdd(
    graphInfo: IGraphInfo,
    options?: { start?: boolean },
  ): Promise<{ id: string; network: NofloNetwork; state: INetworkState }> {
    const { workspaceID, graphTiddlerTitle, fbpGraphString, network } = graphInfo;
    const { state } = network ?? {};
    /** Normally we get the graphInfo from database, so we have ID here. */
    let id = network?.id;
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
    // but if network ID is not provided, means it is a new one  generate a new row for it in the database
    if (id === undefined) {
      const appDatabase = await this.databaseService.getAppDatabase();
      // Add to the db and generate a new id by database
      const workflowNetworkRow = await appDatabase.getRepository(WorkflowNetwork).save({
        graphURI: getTiddlerTidGiUrl(workspaceID, graphTiddlerTitle),
        runningState: WorkflowRunningState.Idle,
        serializedState: JSON.stringify(state),
      });
      id = workflowNetworkRow.id;
    }
    /**
     * A new store for UI state
     */
    const viewModelStore = getWorkflowViewModelStore(state?.viewModel);
    this.viewModelStores.set(id, viewModelStore);
    injectContextWhenRunGraph(id, newNofloNetwork, viewModelStore);
    // put the new network to memory, keep it running.
    this.networks.set(id, newNofloNetwork);
    if (options?.start !== false) {
      await this.startNetwork(id);
    }
    return { network: newNofloNetwork, id, state: viewModelStore.getState() };
  }

  public serializeNetwork(networkID: string): string {
    const network = this.networks.get(networkID);
    if (network === undefined) throw new Error('Network not found');
    return JSON.stringify(network.graph.toJSON());
  }

  public serializeNetworkState(networkID: string): string {
    const network = this.networks.get(networkID);
    if (network === undefined) throw new Error(`serializeNetworkState Network not found for ${networkID}`);
    return JSON.stringify(this.getNetworkState(networkID));
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
    const network = this.networks.get(networkID);
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
    const network = this.networks.get(networkID);
    if (network === undefined) throw new Error('Network not found');
    await network.stop();
    const appDatabase = await this.databaseService.getAppDatabase();
    await appDatabase.getRepository(WorkflowNetwork).update({ id: networkID }, { runningState: WorkflowRunningState.Idle, serializedState: this.serializeNetworkState(networkID) });
    this.networks.delete(networkID);
    this.viewModelStores.delete(networkID);
  }

  public listNetworks() {
    return Object.entries(this.networks).filter((item): item is [string, NofloNetwork] => item[1] !== undefined);
  }
}
