// Shared domain types and limits. SPEC Block C is the source of truth for both.
// Import LIMITS wherever a cap is needed — never redeclare a number (CLAUDE.md rule 11).

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string; // ISO 8601
  updated_at: string;
}

export const LIMITS = {
  titleMax: 200,
  contentMax: 50_000,
  tagMax: 24, // characters per tag
  tagsPerNote: 10,
  notesPerUser: 1_000,
} as const;
