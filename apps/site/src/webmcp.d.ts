import type { WebMcpModelContext } from './cost-webmcp.js';

declare global {
  interface Document {
    /** Experimental WebMCP surface exposed by supported agent browsers. */
    readonly modelContext?: WebMcpModelContext;
  }
}

export {};
