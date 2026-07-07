// Notification macOS (best-effort, zéro dépendance).
import {spawn} from 'node:child_process';

const escapeAppleScript = (s: string): string =>
	s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function notifyScript(title: string): string {
	const msg = escapeAppleScript(`${title} terminée — débrief ?`);
	return `display notification "${msg}" with title "brain 🧠"`;
}

export function notifyMeetingEnded(title: string): void {
	const child = spawn('osascript', ['-e', notifyScript(title)], {
		stdio: 'ignore',
		detached: true,
	});
	child.on('error', () => undefined); // osascript absent → on ignore
	child.unref();
}
