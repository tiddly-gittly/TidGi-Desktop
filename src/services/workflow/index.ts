/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable unicorn/consistent-destructuring */
import { Graph as FbpGraph } from 'fbp-graph';
import { loadJSON } from 'fbp-graph/lib/Graph';
import { injectable } from 'inversify';
import { ComponentLoader, createNetwork } from 'noflo';
import { Network } from 'noflo/lib/Network';
import { IFBPLibrary } from 'the-graph';

import { getBrowserComponentLibrary } from '@/pages/Workflow/GraphEditor/utils/library';
import { lazyInject } from '@services/container';
import { WorkflowNetwork, WorkflowRunningState } from '@services/database/entity/WorkflowNetwork';
import { IDatabaseService } from '@services/database/interface';
import serviceIdentifier from '@services/serviceIdentifier';
import type { IWorkflowService } from './interface';

@injectable()
export class Workflow implements IWorkflowService {
  @lazyInject(serviceIdentifier.Database)
  private readonly databaseService!: IDatabaseService;

  public networks: Record<string, Network | undefined>;

  constructor() {
    this.networks = {};
  }

  private _libraryToLoad?: IFBPLibrary;
  private _componentLoader?: ComponentLoader;

  private async initLibrary() {
    const [libraryToLoad, componentLoader] = await getBrowserComponentLibrary();
    this._libraryToLoad = libraryToLoad;
    this._componentLoader = componentLoader;
    return [libraryToLoad, componentLoader] as const;
  }

  private get componentLoader(): Promise<ComponentLoader> {
    if (this._componentLoader !== undefined) {
      return Promise.resolve(this._componentLoader);
    }
    return this.initLibrary().then(([, componentLoader]) => componentLoader);
  }

  /**
   * Start all workflows that are marked as running in the database. Resume their state based on serializedState on database.
   */
  public async startWorkflows(): Promise<void> {}

  public async addNetworkFromGraphId(graphID: string) {
    // TODO: get fbpGraphString from wiki
  }

  public async addNetworkFromGraphJSON(graphID: string, fbpGraphString: string, options?: { start?: boolean }): Promise<string> {
    const fbpGraph: FbpGraph = await loadJSON(fbpGraphString);
    /**
     * Similar to noflo-runtime-base's `src/protocol/Network.js`, transform FbpGraph to ~~NofloGraph~~ Network
     */
    const newNofloNetwork: Network = await createNetwork(fbpGraph, {
      subscribeGraph: false,
      delay: true,
      componentLoader: await this.componentLoader,
    });
    const appDatabase = await this.databaseService.getAppDatabase();
    // generate a new id by database
    const workflowNetworkRow = await appDatabase.getRepository(WorkflowNetwork).save({
      graphURI: `tidgi://workspaceID/${graphID}`,
      runningState: WorkflowRunningState.Idle,
    });
    const networkID = workflowNetworkRow.id;
    // put the new network to memory, keep it running.
    this.networks[networkID] = newNofloNetwork;
    if (options?.start !== false) {
      await this.startNetwork(networkID);
    }
    return networkID;
  }

  public resumeNetwork(networkID: string): Promise<void> {

  }

  public async startNetwork(networkID: string): Promise<void> {
    const appDatabase = await this.databaseService.getAppDatabase();
    const workflowNetworkRow = await appDatabase.getRepository(WorkflowNetwork).findOneOrFail({ where: { id: networkID } });
    if (workflowNetworkRow === undefined) throw new Error('Network not found in database');
    const network = this.networks[networkID];
    await network.start();
    network.once('end', () => {
      this.networkStore.getState().updateNetwork(networkID, { running: false });
    });
    this.networkStore.getState().updateNetwork(networkID, { running: true });
  }

  public async stopNetwork(networkID: string): Promise<void> {
    const network = this.networks[networkID];
    if (network === undefined) throw new Error('Network not found');
    await network.stop();
    this.networkStore.getState().updateNetwork(networkID, { running: false });
  }

  public serializeNetwork(networkID: string): string {
    const network = this.networks[networkID];
    if (network === undefined) throw new Error('Network not found');
    return JSON.stringify(network.graph.toJSON());
  }

  public async deserializeNetwork(networkID: string, jsonString: string): Promise<void> {
    const graph: FbpGraph = await loadJSON(jsonString);
    await this.addNetworkFromGraph(networkID, graph);
  }

  public listNetworks(): string[] {
    return Object.keys(this.networks);
  }
}
