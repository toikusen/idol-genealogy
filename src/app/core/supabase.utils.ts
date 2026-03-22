/** Returns true when the Supabase error is a "row not found" (PGRST116). */
export function isNotFoundError(error: unknown): boolean {
  return (error as { code?: string })?.code === 'PGRST116';
}
