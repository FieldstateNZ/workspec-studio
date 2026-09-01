import type { WebMcpModelContext } from '@workspec/cost-ui';

declare global {
  interface Document {
    /** Experimental WebMCP surface exposed by supported agent browsers. */
    readonly modelContext?: WebMcpModelContext;
  }
}

export {};
