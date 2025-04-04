import { useStore } from 'zustand';
import { chatsStore, ChatsStoreActions, ChatsStoreState } from './store';

export function useChatsStore<T>(selector: (state: ChatsStoreState & ChatsStoreActions) => T) {
  return useStore(chatsStore, selector);
}
