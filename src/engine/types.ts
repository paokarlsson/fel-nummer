// Typer för fallformatet (case.json). Motorn innehåller ingen berättelse.

export type CharId = string;
export type ServiceId = string;
export type GroupId = string;
export type ChatId = string;

export interface News {
  paper: string;
  head: string;
  sub?: string;
}

export interface KnowsEntry {
  at: string;
  text: string;
}

export interface Guard {
  type: 'neverSay';
  pattern: string;
  log?: string;
}

export interface CaseCharacter {
  id: CharId;
  name: string;
  fullName: string;
  number: string;
  color: string;
  aliases: string[];
  bio: string;
  style: string;
  secret: string;
  /** Den version personen ger utåt. */
  cover?: string;
  story: string;
  goals: string;
  /** Vad personen tror om spelarens nummer i början. */
  aboutPlayer?: string;
  knows: KnowsEntry[];
  schedule: { wake: string; sleep: string };
  talk: number;
  dailyBudget: number;
  stress: number;
  /** Speltid "D HH:MM" då personen dör, eller null. */
  aliveUntil: string | null;
  guards?: Guard[];
  promptExtra?: string;
  /** Korta repliker för demoläget utan nyckel. */
  mockLines?: string[];
}

export interface CaseService {
  id: ServiceId;
  name: string;
  number: string;
  autoReply?: string;
  replies?: string[];
}

export interface CreateGroup {
  id: GroupId;
  name: string;
  createdBy: CharId;
  members: 'allAlive' | CharId[];
}

export interface CaseEvent {
  at: string;
  from?: CharId | ServiceId;
  to?: GroupId;
  text?: string;
  news?: News;
  image?: string;
  /** Beskrivning av bilden (läses av agenterna och skärmläsare). */
  alt?: string;
  stress?: Record<string, number>;
  react?: boolean;
  createGroup?: CreateGroup;
  /** Raderas efter några sekunder. */
  deleteAfter?: number;
  if?: { playerRevealed?: CharId; flag?: string; notFlag?: string };
  end?: boolean;
}

export interface EndingChoice {
  id: string;
  label: string;
  availableFrom: string;
  text: string;
  /** Extra text i slutet beroende på om spelaren pekade ut rätt. */
  epilogueRight?: string;
  epilogueWrong?: string;
}

export interface CaseFile {
  id: string;
  version: number;
  title: string;
  teaser: string;
  language: string;
  startDay: string;
  start: string;
  end: string;
  player: { number: string; premise: string; labelInPrompts: string; previousOwner: string };
  world: string;
  characters: CaseCharacter[];
  services: CaseService[];
  events: CaseEvent[];
  endings: {
    prompt: string;
    choices: EndingChoice[];
    accusable: CharId[];
    culprit: CharId;
    right: string;
    wrong: string;
  };
  truth: { timeline: string[]; secrets: Record<CharId, string> };
}
