import type { SavedQuizSummary } from '../../data/access/quizAccess';

function formatDeadline(activeUntil: string | null): string {
  if (!activeUntil) {
    return 'no deadline';
  }
  const date = new Date(activeUntil);
  return date.toLocaleString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Builds a WhatsApp share link for a given quiz.
 */
export function buildQuizWhatsAppLink(quiz: SavedQuizSummary, shareLink: string): string {
  const subjectStr = quiz.sectionId ? `Section ${quiz.sectionId}` : 'Class'; 
  const deadlineStr = formatDeadline(quiz.activeUntil);
  
  const text = `📝 ${subjectStr} — ${quiz.title} quiz (${quiz.questionCount} Qs, ${quiz.timeLimitMinutes} min).\nOpen till: ${deadlineStr}.\n\nAttempt: ${shareLink}`;
  
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
