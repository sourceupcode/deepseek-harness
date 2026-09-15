# Agent Note: The trust fence on the /plugins bundle route

Status: implemented

English | [中文](2026-09-13-bundle-route-trust-fence.zh.md)

## Problem

The module system's `/plugins` route is a named webserver seat: the dispatcher hands it every request that reaches the socket, and the app's trust boundary — the connection service's Host/Origin fence and browser cookie check — is enforced on the index and the `/api` channel, not on named routes. Before this change, a web app bound beyond loopback served each client bundle composed in its process to any request that named the route, including a rebound browser whose Host header names the attacker's domain instead of the app's authority — the confused-deputy path the `/api` fence exists to close.

The bundles are not secrets, but they are app code: the composed set is exactly the deployment's plugin set, the responses carry immutable cache headers that pin the bytes, and a served bundle is the artifact the trusted page executes. The index's promise — only a session the connection service authenticated reaches the app — did not extend to the app's own script seat, so the promise was weaker than the composition implied.

## Decision

The route enforces the app's trust where it answers. When the composition provides the connection service, every `/plugins` request passes that service's `requestRejection` check — the Host/Origin fence, then browser authentication — before the route inspects the resource, and a refused request receives the fence's bare 401 or 403: not a 404 and not a bundle byte. That check is the connection service's documented route-level predicate, the same fence the service's own `/api` channel and the index run, chosen over `authorizeIndex`, which owns its response and performs the token exchange for the index alone. The read is per request rather than at registration: a composition without the service keeps the route unfenced (it has no app trust to mirror — its index cannot be authorized either), and a service that activates after the route registers fences it without a re-registration. The route's resource answers are otherwise unchanged, and the worker tunnel's carrier path, which carries the browser's own cookie into the tunnel, is untouched by construction.

## Alternatives considered

**A hard `inject` on the connection service in the modules node half.** A declared injection would type the read. Cordis `inject` waits on a service with no timeout, so a composition that mounts the modules service but never provides a connection would park its fiber PENDING and hang activation; the soft read makes the fence conditional on exactly the fact that matters — whether the app carries the trust boundary.

**Fencing in the webserver (a route-level flag or a global fence ahead of named routes).** The webserver is a pure dispatcher by design — it knows no harness concepts, and every route handler retains direct ownership of its response. Forcing every route through an app trust decision would invert that layering: the check's predicate and response are app policy, and a route whose owner deliberately keeps it open would need an escape the dispatcher then owns. The route owner enforcing its own fence keeps the dispatcher generic and leaves the connection service the single authority over the fence's content.

**A dedicated bundle fence (its own cookie or route check).** A second predicate would be a second source of truth for "is this request from a session the app authenticated". Every later app change — trusted hosts, cookie lifetime, the fence's response — would have to be duplicated in the route, and the two checks would drift at exactly the moment a deployment changes trust policy.

## Consequences

A deployed web app serves a `/plugins` bundle only to a request that passes the same check the app's own index and `/api` run: a rebound host, a cross-site marker, or a missing or stale cookie receives a bare 401 or 403 and no bundle bytes. Third-party plugin bundles installed into the profile are served under the same trust as the app's own rows, which is the condition under which their browser halves can be served to the app's sessions at all. Compositions without the connection service behave exactly as before, and the trusted page is unchanged because its requests already carry the cookie the index minted. The cost is one predicate call per request on the route.
