// Supabase DB types — generated from supabase/migrations/001_initial.sql
// TODO(TASK-030): replace with `supabase gen types typescript` once Supabase project is linked.

export interface DbUser {
  id: string;
  email: string;
  created_at: string;
}

export interface DbPlan {
  id: string;
  user_id: string;
  name: string;
  plan_state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DbSnapshot {
  id: string;
  plan_id: string;
  user_id: string;
  name: string;
  plan_json: Record<string, unknown>;
  created_at: string;
}

export interface DbPreferences {
  user_id: string;
  settings: Record<string, unknown>;
  updated_at: string;
}

export interface DbChatUsage {
  id: string;
  user_id: string;
  date: string;
  tokens_used: number;
}
