// Custom error codes for Supabase helpers. Constants live in a plain module because "use server"
// files can export only async functions.

// 0 rows deleted: RLS-blocked or already deleted (double click / other tab).
export const NO_ROWS_DELETED = "NO_ROWS_DELETED";

export const UNIQUE_VIOLATION = "23505";

// plpgsql no_data_found; save_budget_declaration (migration 24) raises it with ERRCODE = 'P0002'
// when the target row is missing.
export const NO_DATA_FOUND = "P0002";

export const FOREIGN_KEY_VIOLATION = "23503";

// Raised by save_budget_declaration and the closed-month write trigger (migration 38, SQLSTATE 42501).
export const MONTH_CLOSED = "MONTH_CLOSED";
