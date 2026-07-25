/**
 * One entry of a Private Endpoint's `config.targets`: the resource it
 * connects to, and (when the vendor payload names it) the specific
 * sub-resource(s) the connection targets. Shared shape across the terraform
 * (`private_service_connection`) and ARM (`privateLinkServiceConnections`)
 * adapters — both vendors describe the same concept under different
 * attribute names, so the *output* shape is unified here even though each
 * adapter's extraction of it stays separate.
 */
export interface PrivateEndpointTarget {
  readonly name?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly subresourceNames?: readonly string[] | undefined;
}
