// The server identity `@workspec/mcp-host` advertises during MCP's
// `initialize` handshake. Shared by both transports (stdio and `--http`) so
// a client sees the same identity regardless of which one it's connected
// over.

/** Server identity for the aggregate WorkSpec MCP Host. */
export const MCP_HOST_SERVER_INFO: { name: string; version: string } = {
  name: 'workspec-mcp',
  version: '0.1.0-alpha.1',
};
