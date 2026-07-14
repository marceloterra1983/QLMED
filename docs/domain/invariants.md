# Domain invariants

- A user may operate only within the company context resolved by the server.
- A viewer cannot perform mutating administrative or fiscal operations.
- The same fiscal document must not be duplicated within its defined uniqueness
  boundary.
- Invoice direction is derived from fiscal identity, not arbitrary UI input.
- Integration credentials and certificates are never returned by ordinary APIs
  or written to logs.
- Background synchronization must not create concurrent runs for the same
  company and method when a run is already active.
- Notification delivery is recorded durably before asynchronous publication.
- Development automations never own production schedules or real webhooks.

