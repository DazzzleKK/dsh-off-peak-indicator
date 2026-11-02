/**
 * Host half of `dsh-off-peak-indicator` — deliberately empty.
 *
 * The pricing window is a pure function of the UTC clock, so the widget needs no
 * service, no RPC and no Host state: the browser computes the same answer the
 * Host would. This half exists only because a bundle row mounts exactly one
 * package, and that package must expose an entry point the Loader can activate.
 */

/** Nothing to install. */
function apply() {
  // Intentionally empty: the client half owns the whole widget.
}

/** No Host services are required. */
const inject = [];

export { apply, inject };
export default { apply, inject };
