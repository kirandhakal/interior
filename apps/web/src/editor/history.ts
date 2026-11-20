import { useReducer } from 'react';
import type { Project, Room } from '@studio/model';

type History = { current: Project; past: Project[]; future: Project[]; key?: string | Room };
type Action =
  | { type: 'edit'; update: (project: Project) => Project; key?: string | Room }
  | { type: 'load'; project: Project }
  | { type: 'undo' | 'redo' };

function initial(current: Project): History {
  return { current, past: [], future: [] };
}

function reducer(state: History, action: Action): History {
  switch (action.type) {
    case 'load': return initial(action.project);
    case 'edit': {
      const current = action.update(state.current);
      if (current === state.current) return state;
      return { current, past: action.key && action.key === state.key ? state.past : [...state.past.slice(-59), state.current], future: [], key: action.key };
    }
    case 'undo':
      return state.past.length ? {
        current: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.current, ...state.future],
      } : state;
    case 'redo':
      return state.future.length ? {
        current: state.future[0], past: [...state.past, state.current], future: state.future.slice(1),
      } : state;
  }
}

export function useProjectHistory(makeInitial: () => Project) {
  return useReducer(reducer, makeInitial, create => initial(create()));
}
