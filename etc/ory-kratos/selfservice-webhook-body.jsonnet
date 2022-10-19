function(ctx) {
  userId: ctx.identity.id,
  emails: [
    {
      id: addr.id,
      email: addr.value,
      verified: addr.verified,
      createdAt: addr.created_at,
      updatedAt: addr.updated_at,
    }
    for addr in ctx.identity.verifiable_addresses
  ],
}
