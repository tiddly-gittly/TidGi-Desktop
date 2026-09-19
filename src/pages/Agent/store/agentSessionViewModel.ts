import { type ConversationTimelinePageClient, ConversationTimelineWindowController } from '@memeloop/react-ui/chat';
import { AgentSessionController, type AgentSessionControllerOptions, type AgentSessionListener, type AgentSessionSnapshot } from 'memeloop';
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface DesktopAgentSessionViewModelOptions extends AgentSessionControllerOptions {
  timelineClient: ConversationTimelinePageClient;
}

export interface DesktopAgentSessionViewModelState {
  snapshot: AgentSessionSnapshot;
}

/**
 * Desktop's state boundary for one chat tab.
 *
 * Core remains responsible for cursor/revision-aware session operations. This
 * view model owns the renderer subscription and exposes its immutable snapshot
 * through Zustand, so React and host-only concerns do not become another
 * controller/service layered around Core.
 */
export class DesktopAgentSessionViewModel extends AgentSessionController {
  public readonly store: StoreApi<DesktopAgentSessionViewModelState>;
  public readonly timelineController: ConversationTimelineWindowController;
  private readonly unsubscribeCore: () => void;
  private disposed = false;

  public constructor({ timelineClient, ...options }: DesktopAgentSessionViewModelOptions) {
    super(options);
    this.store = createStore<DesktopAgentSessionViewModelState>(() => ({ snapshot: super.getSnapshot() }));
    this.unsubscribeCore = super.subscribe(snapshot => {
      this.store.setState({ snapshot });
    });
    this.timelineController = new ConversationTimelineWindowController(timelineClient);
  }

  /** React-UI receives the Zustand-backed snapshot instead of a second stream. */
  public override getSnapshot(): AgentSessionSnapshot {
    return this.store.getState().snapshot;
  }

  public override subscribe(listener: AgentSessionListener): () => void {
    return this.store.subscribe(state => {
      listener(state.snapshot);
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeCore();
    this.timelineController.dispose();
    this.stop();
  }
}
