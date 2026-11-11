# Application error recovery

The root application now has two recovery layers:

- `src/app/error.tsx`: a client error boundary for failures in page rendering beneath the root layout. It offers **Try loading again** using Next.js `reset()` and a regular home link. The page displays no internal stack trace, SQL query, provider credentials, request data or exception message.
- `src/app/global-error.tsx`: the existing last-resort root-layout fallback. It retains Sentry capture and a retry button, and now has a home link.

Both capture exceptions with the existing Sentry integration when available. **Neither UI claims that a support team has been notified**: deployments may not have Sentry or alert routing configured. The fallback copy is deliberately neutral and actionable.

These screens do not make failed payment/booking operations automatically safe to repeat. Users should review their recorded booking or order status before initiating a new payment, following the existing flow-specific recovery rules.

No API, schema, payment behavior or environment variables change. Rollback: revert the two boundary files. See component coverage in `tests/components/AppErrorRecovery.test.tsx`.
