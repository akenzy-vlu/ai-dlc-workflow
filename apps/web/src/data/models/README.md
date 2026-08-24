# Models

The wire format, exactly as the API sends it — nothing renamed, nothing normalised.

They exist so that a change on the server surfaces here, in one place, as a compile error
rather than as a component reading `undefined`. Everything past the mapper speaks in
domain entities and never sees these shapes.

Where a DTO is already identical to its entity, the model still gets its own alias rather
than importing the entity: the two are allowed to diverge, and the day they do, the alias
is where it happens.
