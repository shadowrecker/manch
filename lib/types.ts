// Shared API contract types. Imported by both server and client code, so keep
// this free of runtime/server-only imports. Module domain types live in
// lib/modules/<m>/types.ts.

export type { Plan, ModuleKey } from '@/lib/plans';

export interface ApiError {
  error: string;
  code?: string;
}
