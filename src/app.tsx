import React, {useState, useEffect, useRef} from 'react';
import {useInput, useStdout, useApp} from 'ink';
import type {Item, Note, Meeting} from './core/types.ts';
import {todayYMD, stepReminder} from './core/date.ts';
import {buildView, windowView} from './core/view.ts';
import {
	addItem,
	editText,
	setDone,
	setReminder,
	removeItem,
} from './core/items.ts';
import {
	addNote,
	editNote,
	removeNote,
	togglePin,
	sortNotes,
	staleNotes,
	sweepStale,
} from './core/notes.ts';
import {
	load,
	save,
	loadNotes,
	saveNotes,
	loadHandled,
	saveHandled,
} from './core/storage.ts';
import {
	pendingDebriefs,
	linesToItems,
	pruneHandled,
	lastDebriefable,
} from './core/debrief.ts';
import {notifyMeetingEnded} from './core/notify.ts';
import {glyph, worldColor} from './core/theme.ts';
import {parseCommand} from './core/commands.ts';
import {isCtrlC} from './core/multiline.ts';
import {connect, fetchTodaysEvents, isConnected} from './core/google-client.ts';
import TasksBody from './components/organisms/tasks-body.tsx';
import NotesBody from './components/organisms/notes-body.tsx';
import SweepView from './components/organisms/sweep-view.tsx';
import ConnectPrompt from './components/organisms/connect-prompt.tsx';
import DebriefView from './components/organisms/debrief-view.tsx';
import InputBar from './components/molecules/input-bar.tsx';
import ReminderStepper from './components/molecules/reminder-stepper.tsx';
import HintBar from './components/molecules/hint-bar.tsx';
import AgendaStatus, {
	type ConnState,
} from './components/molecules/agenda-status.tsx';
import AppLayout from './components/templates/app-layout.tsx';

type Mode = 'input' | 'nav' | 'reminder';
type World = 'tasks' | 'notes';

const nowISO = () => new Date().toISOString();

export default function App() {
	const initial = load();
	const initialNotes = loadNotes();
	const mountToday = todayYMD(new Date());

	const [items, setItems] = useState<Item[]>(initial.items);
	const [notes, setNotes] = useState<Note[]>(initialNotes.notes);
	const [loadError] = useState<string | null>(
		initial.error ?? initialNotes.error,
	);

	const [world, setWorld] = useState<World>('tasks');
	const [mode, setMode] = useState<Mode>('input');

	const [draft, setDraft] = useState('');
	const [noteDraft, setNoteDraft] = useState('');
	const [reminderValue, setReminderValue] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
	const [selected, setSelected] = useState(0);
	const [noteSelected, setNoteSelected] = useState(0);

	// balayage au démarrage : snapshot des notes périmées, figé au montage
	const [sweepList] = useState(() =>
		staleNotes(initialNotes.notes, mountToday),
	);
	const [sweeping, setSweeping] = useState(sweepList.length > 0);
	const [sweepMode, setSweepMode] = useState<'bulk' | 'review'>('bulk');
	const [sweepIndex, setSweepIndex] = useState(0);

	// --- agenda Google (v1 : connexion + lecture) ---
	const [connState, setConnState] = useState<ConnState>(() =>
		isConnected() ? 'connected' : 'disconnected',
	);
	const [meetings, setMeetings] = useState<Meeting[]>([]);
	const [connectError, setConnectError] = useState<string | null>(null);
	const [connectPromptOpen, setConnectPromptOpen] = useState(
		() => !isConnected(),
	);

	// --- débrief de fin de réunion (v2) ---
	const [handled, setHandled] = useState<string[]>(() => loadHandled());
	const [debriefQueue, setDebriefQueue] = useState<Meeting[]>([]);
	const [debriefPhase, setDebriefPhase] = useState<'actions' | 'infos'>(
		'actions',
	);
	const [debriefDraft, setDebriefDraft] = useState('');

	const handledRef = useRef(handled);
	handledRef.current = handled;
	const queueRef = useRef(debriefQueue);
	queueRef.current = debriefQueue;
	const caughtUp = useRef(false);

	const markHandled = (id: string) => {
		setHandled(prev => {
			if (prev.includes(id)) return prev;
			const next = [...prev, id];
			saveHandled(next);
			return next;
		});
	};

	// charge les réunions du jour dès que l'état passe à « connected »,
	// purge les ids obsolètes et amorce la file de débriefs en attente (rattrapage, pas de notif)
	useEffect(() => {
		if (connState !== 'connected') return;
		let alive = true;
		fetchTodaysEvents().then(
			m => {
				if (!alive) return;
				setMeetings(m);
				const todaysIds = m.map(x => x.id);
				const pruned = pruneHandled(handledRef.current, todaysIds);
				if (pruned.length !== handledRef.current.length) {
					setHandled(pruned);
					saveHandled(pruned);
				}

				if (!caughtUp.current) {
					caughtUp.current = true;
					setDebriefQueue(pendingDebriefs(m, nowISO(), pruned)); // rattrapage : 1er passage seulement
				}
			},
			(error: unknown) => {
				if (!alive) return;
				setConnState('error');
				setConnectError(error instanceof Error ? error.message : String(error));
			},
		);
		return () => {
			alive = false;
		};
	}, [connState]);

	// --- sondage périodique : détecte les réunions qui viennent de se terminer ---
	useEffect(() => {
		if (connState !== 'connected') return;
		const tick = async () => {
			try {
				const m = await fetchTodaysEvents();
				setMeetings(m);
				const pending = pendingDebriefs(m, nowISO(), handledRef.current);
				const known = new Set(queueRef.current.map(x => x.id));
				const fresh = pending.filter(p => !known.has(p.id));
				if (fresh.length > 0) {
					for (const f of fresh) notifyMeetingEnded(f.title); // ping live
					setDebriefQueue(prev => [...prev, ...fresh]);
				}
			} catch {
				// réseau : silencieux, retry au prochain tick
			}
		};

		const id = setInterval(tick, 5 * 60 * 1000);
		return () => {
			clearInterval(id);
		};
	}, [connState]);

	const runConnect = async () => {
		setConnectPromptOpen(false);
		setConnectError(null);
		setConnState('connecting');
		try {
			await connect();
			setConnState('connected'); // déclenche l'effet de chargement ci-dessus
		} catch (error: unknown) {
			setConnState('error');
			setConnectError(error instanceof Error ? error.message : String(error));
		}
	};

	// dispatch d'une commande de la barre (`/gauth`, `/debrief`, …)
	const runCommand = (name: string) => {
		if (name === 'gauth') void runConnect();
		if (name === 'debrief') runDebrief();
	};

	const head = debriefQueue[0];

	const advanceDebrief = () => {
		setDebriefPhase('actions');
		setDebriefDraft('');
		setDebriefQueue(prev => prev.slice(1));
	};

	const submitDebrief = (value: string) => {
		if (!head) return;
		const lines = linesToItems(value);
		if (debriefPhase === 'actions') {
			if (lines.length > 0) {
				let next = items;
				for (const l of lines) next = addItem(next, l, nowISO(), head.title);
				commit(next);
			}

			setDebriefPhase('infos');
			setDebriefDraft('');
			return;
		}

		if (lines.length > 0) {
			let next = notes;
			for (const l of lines) next = addNote(next, l, nowISO(), head.title);
			commitNotes(next);
		}

		markHandled(head.id);
		advanceDebrief();
	};

	const skipDebrief = () => {
		if (head) markHandled(head.id);
		advanceDebrief();
	};

	const runDebrief = () => {
		const last = lastDebriefable(meetings, nowISO());
		if (!last) return;
		setDebriefPhase('actions');
		setDebriefDraft('');
		setDebriefQueue(prev => [last, ...prev.filter(m => m.id !== last.id)]);
	};

	const {stdout} = useStdout();
	const {exit} = useApp();

	// Ctrl+C quitte toujours — y compris quand le protocole kitty le remappe en
	// `[99;5u` (sinon Ink ne le voit pas). exit() démonte proprement (restaure kitty).
	useInput((input, key) => {
		if (isCtrlC(input, key)) exit();
	});

	// hauteur du terminal, re-lue sur resize (le split Ghostty bouge souvent)
	const [termRows, setTermRows] = useState(stdout?.rows ?? 24);
	useEffect(() => {
		if (!stdout) return;
		const onResize = () => {
			setTermRows(stdout.rows);
		};

		stdout.on('resize', onResize);

		return () => {
			stdout.off('resize', onResize);
		};
	}, [stdout]);

	const today = todayYMD(new Date()); // recalculé à chaque render (donc à chaque frappe)
	const view = buildView(items, today);
	const visible = [...view.due, ...view.active]; // ordre affiché = ordre navigable
	const clampedSel = Math.min(selected, Math.max(0, visible.length - 1));

	const noteList = sortNotes(notes);
	const noteSel = Math.min(noteSelected, Math.max(0, noteList.length - 1));

	// fenêtre de scroll : hauteur du terminal moins le chrome (logo 4 lignes + marge, saisie, hints)
	// ponytail: marge fixe de 11 lignes, ajuster si le chrome grossit
	const rows = Math.max(1, termRows - 11);
	const cols = stdout?.columns ?? 80;
	// bannière signature « ressort aujourd'hui » : label + filet qui remplit la largeur
	const dueLabel = ` ${glyph.moreUp} ressort aujourd'hui `;
	const dueRule =
		dueLabel + glyph.rule.repeat(Math.max(4, cols - dueLabel.length - 2));
	const {start, end} = windowView(visible.length, clampedSel, rows);
	const shown = visible.slice(start, end);
	const noteWin = windowView(noteList.length, noteSel, rows);
	const shownNotes = noteList.slice(noteWin.start, noteWin.end);

	// persiste à chaque changement
	const commit = (next: Item[]) => {
		setItems(next);
		save(next);
	};

	const commitNotes = (next: Note[]) => {
		setNotes(next);
		saveNotes(next);
	};

	const blocked = sweeping || connectPromptOpen || debriefQueue.length > 0;

	// --- Prompt de connexion agenda au démarrage (s'affiche après le ménage) ---
	useInput(
		(input, key) => {
			if (input === 'o' || key.return) void runConnect();
			else if (input === 'n' || key.escape) setConnectPromptOpen(false);
		},
		{isActive: connectPromptOpen && !sweeping},
	);

	// --- Bascule Tab (tâches ⇄ notes). '[9u' = Tab si le protocole kitty le remappe. ---
	useInput(
		(input, key) => {
			if (key.tab || input === '[9u') {
				setWorld(w => (w === 'tasks' ? 'notes' : 'tasks'));
				setMode('input');
			}
		},
		{isActive: !blocked},
	);

	// --- Monde TÂCHES (logique v1 inchangée : input / nav / reminder-stepper) ---
	useInput(
		(input, key) => {
			if (mode === 'input') {
				// seule touche gérée ici en saisie : ↑ sort de la barre vers la nav (draft conservé)
				if (key.upArrow && visible.length > 0) {
					setSelected(visible.length - 1); // dernière ligne active
					setMode('nav');
				}

				return; // tout le reste de la frappe est géré par le MultilineInput focus
			}

			if (mode === 'reminder') {
				const target = visible[clampedSel];
				if (!target || key.escape) {
					setMode('nav');
					return;
				}

				if (key.return) {
					commit(setReminder(items, target.id, reminderValue));
					setMode('nav');
				} else if (key.backspace || key.delete) {
					commit(setReminder(items, target.id, null)); // ⌫ = retirer le rappel
					setMode('nav');
				} else if (key.rightArrow) {
					setReminderValue(v => stepReminder(v, 'day', 1, today));
				} else if (key.leftArrow) {
					setReminderValue(v => stepReminder(v, 'day', -1, today));
				} else if (key.upArrow) {
					setReminderValue(v => stepReminder(v, 'week', 1, today));
				} else if (key.downArrow) {
					setReminderValue(v => stepReminder(v, 'week', -1, today));
				}

				return;
			}

			if (mode === 'nav') {
				if (key.downArrow) {
					if (clampedSel >= visible.length - 1) setMode('input');
					else setSelected(clampedSel + 1);
				} else if (key.upArrow) {
					setSelected(Math.max(0, clampedSel - 1));
				} else if (key.escape) {
					setMode('input');
				} else if (visible.length > 0) {
					const target = visible[clampedSel];
					if (input === ' ') {
						commit(setDone(items, target.id, !target.done, nowISO()));
					} else if (input === 'd') {
						commit(removeItem(items, target.id));
					} else if (input === 'e') {
						setDraft(target.text);
						setEditingId(target.id);
						setMode('input');
					} else if (input === 'r') {
						setReminderValue(target.remindOn ?? today);
						setMode('reminder');
					}
				}
			}
		},
		{isActive: world === 'tasks' && !blocked},
	);

	// --- Monde NOTES : ↑ sort de la barre vers la nav (draft conservé) ---
	useInput(
		(input, key) => {
			if (key.upArrow && noteList.length > 0) {
				setNoteSelected(noteList.length - 1);
				setMode('nav');
			}
		},
		{isActive: world === 'notes' && mode === 'input' && !blocked},
	);

	// --- Monde NOTES : navigation (p épingler, e éditer, d suppr) ---
	useInput(
		(input, key) => {
			if (key.downArrow) {
				if (noteSel >= noteList.length - 1) setMode('input');
				else setNoteSelected(noteSel + 1);
			} else if (key.upArrow) {
				setNoteSelected(Math.max(0, noteSel - 1));
			} else if (key.escape) {
				setMode('input');
			} else if (noteList.length > 0) {
				const target = noteList[noteSel];
				if (input === 'p') {
					commitNotes(togglePin(notes, target.id));
				} else if (input === 'd') {
					commitNotes(removeNote(notes, target.id));
				} else if (input === 'e') {
					setNoteDraft(target.text);
					setEditingNoteId(target.id);
					setMode('input');
				}
			}
		},
		{isActive: world === 'notes' && mode === 'nav' && !blocked},
	);

	// --- Balayage au démarrage ---
	const endSweep = () => {
		setSweeping(false);
		setSweepMode('bulk');
	};

	const advanceReview = () => {
		if (sweepIndex + 1 >= sweepList.length) endSweep();
		else setSweepIndex(sweepIndex + 1);
	};

	useInput(
		input => {
			if (sweepMode === 'bulk') {
				if (input === 'd') {
					commitNotes(sweepStale(notes, today));
					endSweep();
				} else if (input === 'k') {
					endSweep();
				} else if (input === 'r') {
					setSweepMode('review');
					setSweepIndex(0);
				}

				return;
			}

			const current = sweepList[sweepIndex];
			if (!current) {
				endSweep();
				return;
			}

			if (input === 'k') {
				advanceReview();
			} else if (input === 'd') {
				commitNotes(removeNote(notes, current.id));
				advanceReview();
			} else if (input === 'p') {
				commitNotes(togglePin(notes, current.id));
				advanceReview();
			}
		},
		{isActive: sweeping},
	);

	const submitInput = (value: string) => {
		const cmd = parseCommand(value);
		if (cmd) {
			runCommand(cmd.name);
			setDraft('');
			return;
		}

		const text = value.trim();
		if (text === '') {
			// rien à ajouter, on quitte juste l'édition éventuelle
			setEditingId(null);
			return;
		}

		if (editingId) {
			commit(editText(items, editingId, text));
			setEditingId(null);
		} else {
			commit(addItem(items, text, nowISO()));
		}

		setDraft('');
	};

	const submitNote = (value: string) => {
		const cmd = parseCommand(value);
		if (cmd) {
			runCommand(cmd.name);
			setNoteDraft('');
			return;
		}

		if (value.trim() === '') {
			setEditingNoteId(null);
			return;
		}

		if (editingNoteId) {
			commitNotes(editNote(notes, editingNoteId, value));
			setEditingNoteId(null);
		} else {
			commitNotes(addNote(notes, value, nowISO()));
		}

		setNoteDraft('');
	};

	const cancelNote = () => {
		setEditingNoteId(null);
		setMode('nav');
	};

	if (sweeping) {
		return (
			<SweepView
				list={sweepList}
				mode={sweepMode}
				index={sweepIndex}
				loadError={loadError}
			/>
		);
	}

	if (connectPromptOpen) {
		return <ConnectPrompt loadError={loadError} />;
	}

	if (head) {
		return (
			<DebriefView
				meeting={head}
				phase={debriefPhase}
				remaining={debriefQueue.length}
				draft={debriefDraft}
				onChange={setDebriefDraft}
				onSubmit={submitDebrief}
				onSkip={skipDebrief}
				termRows={termRows}
			/>
		);
	}

	const body =
		world === 'tasks' ? (
			<TasksBody
				visible={visible}
				shown={shown}
				start={start}
				end={end}
				due={view.due}
				dueRule={dueRule}
				today={today}
				active={mode !== 'input'}
				selectedId={visible[clampedSel]?.id}
			/>
		) : (
			<NotesBody
				list={noteList}
				shown={shownNotes}
				start={noteWin.start}
				end={noteWin.end}
				active={mode !== 'input'}
				selectedId={noteList[noteSel]?.id}
			/>
		);

	const footer =
		world === 'tasks' && mode === 'reminder' ? (
			<ReminderStepper reminderValue={reminderValue} today={today} />
		) : world === 'tasks' ? (
			<InputBar
				world="tasks"
				editing={Boolean(editingId)}
				value={draft}
				focus={mode === 'input'}
				placeholder="capturer une tâche / un feedback…"
				onChange={setDraft}
				onSubmit={submitInput}
			/>
		) : (
			<InputBar
				world="notes"
				editing={Boolean(editingNoteId)}
				value={noteDraft}
				focus={mode === 'input'}
				placeholder="capturer une note…"
				onChange={setNoteDraft}
				onSubmit={submitNote}
				onCancel={cancelNote}
			/>
		);

	return (
		<AppLayout
			termRows={termRows}
			accent={worldColor(world)}
			label={world === 'tasks' ? 'TÂCHES' : 'NOTES'}
			loadError={loadError}
			status={
				<AgendaStatus
					state={connState}
					meetings={meetings}
					nowISO={nowISO()}
					error={connectError}
				/>
			}
			body={body}
			footer={footer}
			hints={<HintBar world={world} mode={mode} />}
		/>
	);
}
