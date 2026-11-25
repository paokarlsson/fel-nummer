import type { CaseFile, CharId, ChatId, GroupId, News } from './types';
import { parseAt } from './time';

export type Sender = 'player' | 'system' | string;

export interface Message {
  id: number;
  t: number;
  from: Sender;
  text?: string;
  news?: News;
  image?: string;
  alt?: string;
  /** Numret (eller tidningen) som ett vidarebefordrat sms kom ifrån. */
  fwdFrom?: string;
  deleted?: boolean;
  /** Bara för spelarens sms: levererat (✓✓) eller ej levererat (✓). */
  status?: 'delivered' | 'sent';
}

export interface AgentState {
  stress: number;
  used: Record<number, number>;
  /** Chattar med obesvarade sms som ska få svar när personen vaknar. */
  pending: ChatId[];
  last: string;
  revealed: boolean;
}

export interface LogEntry {
  t: number;
  who: string;
  kind: 'turn' | 'abstain' | 'guard' | 'error' | 'event' | 'score' | 'info';
  text: string;
}

export interface EndingResult {
  accused: CharId;
  right: boolean;
  choice?: string;
}

export interface GameState {
  caseId: string;
  version: number;
  t: number;
  eventIdx: number;
  nextId: number;
  chats: Record<ChatId, Message[]>;
  /** Spelarens sparade kontakter, per karaktärs- eller tjänst-id. */
  contacts: Record<string, { name: string; color: string }>;
  unread: Record<ChatId, number>;
  agents: Record<CharId, AgentState>;
  groups: Record<GroupId, { name: string; members: CharId[]; createdBy: CharId }>;
  flags: Record<string, boolean>;
  log: LogEntry[];
  paused: boolean;
  endReached: boolean;
  ended?: EndingResult;
  usage: { calls: number; inputTokens: number; outputTokens: number };
  startedAt: number;
}

export function newGame(c: CaseFile): GameState {
  const agents: Record<CharId, AgentState> = {};
  for (const ch of c.characters) {
    agents[ch.id] = { stress: ch.stress, used: {}, pending: [], last: '', revealed: false };
  }
  return {
    caseId: c.id,
    version: c.version,
    t: parseAt(c.start),
    eventIdx: 0,
    nextId: 1,
    chats: {},
    contacts: {},
    unread: {},
    agents,
    groups: {},
    flags: {},
    log: [],
    paused: false,
    endReached: false,
    usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
    startedAt: Date.now(),
  };
}
