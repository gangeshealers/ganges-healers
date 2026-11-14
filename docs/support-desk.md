# Member support desk

Members open **Support center** from their dashboard or account menu. A new request takes a subject of 5–120 characters and a message of 20–3,000 characters. Each member can submit five new requests in a rolling 24-hour period. Follow-ups belong to the existing request.

## Reading and replying

Open a request to read the original message and its replies. The newest page opens first and shows up to 30 messages in chronological order. Older messages are available through the history links. Only the owning member and current administrators can read a request. A member follow-up reopens a resolved request and keeps an in-review request in review.

Administrators open **Support queue** from their account menu. Open a conversation to reply, change its status, or do both together. Each staff reply with text creates one private in-app notification for the ticket owner. Its generic wording keeps the reply and subject inside the support center. Status-only updates appear in the conversation. Support delivery happens inside the application.

The server records the message, ticket status, staff notification and activity record together. Activity records contain identifiers and status changes. If the connection drops during a send, **Retry same reply** reuses the original request ID. If another person replies first, **Review latest conversation** refreshes the thread and preserves the unsent draft.

## Deployment and rollback

1. Apply `20261111010000_member_support_desk` to the intended database. Set `SUPPORT_DESK_ENABLED=true` for that deployment to enable the member inbox and staff queue.
2. Apply `20261113010000_support_conversations`. This additive migration copies each existing nonempty staff response into history using the recorded response time when available. It preserves the original ticket and leaves historical staff authors unspecified.
3. Set `SUPPORT_CONVERSATIONS_ENABLED=true` for the same deployment and redeploy. The detail pages and reply endpoint require both flags. Staff and members can now continue the same request. The latest staff answer is also saved on the original ticket for older clients.
4. To roll back to the single-response interface, disable the conversation flag and redeploy. Preserve both tables and migration records. The desk flag controls the whole support center.

Before production cutover, verify the production database target and confirm support staffing and data-retention arrangements. Member account deletion cascades to that member's tickets and replies. Removing a staff account clears the historical author reference while retaining its messages.
