# Public Healer Schedule Cues

The `HealerCard` on a service detail page now derives its informational working-hour cue from the same validated weekly schedule used by booking rules. Schedule keys are saved as lowercase weekdays (`monday`, etc.), and the cue uses `BOOKING_TIME_ZONE` (`Asia/Kolkata`) instead of the visitor's local day.

## Behavior
- If today's regular shift has not ended, the card shows today's saved working hours.
- If today's shift has ended, the cue skips to the next valid weekday, including the same weekday next week.
- Missing or malformed schedules have no cue.
- Displayed hours are **not** a confirmation that an appointment is open. The card directs customers to the actual booking calendar for live conflict/duration checks.

No schema, API shape, appointment capacity, pricing or payment logic changed. This is a public presentation correction only.

## Verification
`tests/unit/healer-schedule-cue.test.ts` checks the India-time day boundary, ended shifts, week rollover, midnight end time, and invalid schedules. Integration and E2E booking slot decisions remain in their existing tests.

Rollback: revert the schedule-cue addition, card integration, and associated test/docs. No data migration is needed.
