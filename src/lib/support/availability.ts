/**
 * Support remains disabled until the SupportTicket migration is verified on
 * that deployment's own database. Default-off prevents P2021/P2022 errors
 * when release code lands before an environment's planned schema cutover.
 */
export function isSupportDeskEnabled() {
  return process.env.SUPPORT_DESK_ENABLED === 'true'
}
