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
  private unsubscribeCore?: () => void;
  private disposed = false;
  private lifecycleGeneration = 0;

  public constructor({ timelineClient, ...options }: DesktopAgentSessionViewModelOptions) {
    super(options);
    this.store = createStore<DesktopAgentSessionViewModelState>(() => ({ snapshot: super.getSnapshot() }));
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

  /**
   * Retain this view model for one host lifecycle.
   *
   * React StrictMode deliberately runs an effect's setup, cleanup and setup
   * again. Deferring final disposal by one microtask lets the second setup
   * cancel that probe cleanup, while a real unmount or identity change still
   * releases the Core subscription and timeline controller promptly.
   */
  public acquire(): () => void {
    if (this.disposed) throw new Error('agent_session_view_model_disposed');
    this.unsubscribeCore ??= super.subscribe(snapshot => {
      this.store.setState({ snapshot });
    });
    const generation = ++this.lifecycleGeneration;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.stop();
      queueMicrotask(() => {
        if (!this.disposed && this.lifecycleGeneration === generation) this.dispose();
      });
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeCore?.();
    this.unsubscribeCore = undefined;
    this.timelineController.dispose();
    this.stop();
  }
}
