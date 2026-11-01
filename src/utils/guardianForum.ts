/*
 * Members-only Q&A forum helpers: a question is a message with answers (kind 'answer') pointing at it by parent_id.
 * Pinned questions come first, then the newest. Hidden posts are dropped unless the viewer may moderate (the Guardian).
 */
import type { GuideCommunityMessage } from './guidePortal';

export interface ForumThread {
  question: GuideCommunityMessage;
  answers: GuideCommunityMessage[];
}

export function threadForumMessages(messages: GuideCommunityMessage[], options: { viewerIsGuardian: boolean; viewerId?: string }): ForumThread[] {
  const visible = (message: GuideCommunityMessage) => !message.hidden || options.viewerIsGuardian || message.user_id === options.viewerId;
  const answers = new Map<string, GuideCommunityMessage[]>();
  for (const message of messages) {
    if (message.kind !== 'answer' || !message.parent_id || !visible(message)) continue;
    answers.set(message.parent_id, [...(answers.get(message.parent_id) || []), message]);
  }
  const byTime = (a: GuideCommunityMessage, b: GuideCommunityMessage) => a.created_at.localeCompare(b.created_at);
  return messages
    .filter((message) => message.kind !== 'answer' && visible(message))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || byTime(b, a))
    .map((question) => ({ question, answers: (answers.get(question.id) || []).sort(byTime) }));
}

/** Whether the forum should show the paywall instead of the conversation. */
export function forumNeedsMembership(channel: { members_only?: boolean } | null, hasAccess: boolean): boolean {
  return Boolean(channel?.members_only) && !hasAccess;
}
