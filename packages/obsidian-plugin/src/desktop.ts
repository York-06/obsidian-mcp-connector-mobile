// Everything that needs Node (http server, broker, client-config writers)
// enters the bundle only through this file, so mobile never evaluates it.
export {
  createBrokerHost,
  startDiscovery,
} from "./features/mcp-client-config/services/discoveryBroker";
export {
  setup as mcpTransportSetup,
  teardown as mcpTransportTeardown,
} from "./features/mcp-transport";
export { AccessControlSection } from "./features/mcp-transport";
export { ClaudeDesktopIntegrationSection } from "./features/mcp-client-config";
