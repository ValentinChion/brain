import React, {useState} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import TextInput from 'ink-text-input';
import type {Item, Note} from './types.ts';
import {todayYMD, stepReminder} from './date.ts';
import {buildView, isDue, windowView} from './view.ts';
import {addItem, editText, setDone, setReminder, removeItem} from './items.ts';
import {
	addNote,
	editNote,
	removeNote,
	togglePin,
	sortNotes,
	staleNotes,
	sweepStale,
} from './notes.ts';
import {load, save, loadNotes, saveNotes} from './storage.ts';
import MultilineInput from './multiline-input.tsx';

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

	const {stdout} = useStdout();

	const today = todayYMD(new Date()); // recalculé à chaque render (donc à chaque frappe)
	const view = buildView(items, today);
	const visible = [...view.due, ...view.active]; // ordre affiché = ordre navigable
	const clampedSel = Math.min(selected, Math.max(0, visible.length - 1));

	const noteList = sortNotes(notes);
	const noteSel = Math.min(noteSelected, Math.max(0, noteList.length - 1));

	// fenêtre de scroll : hauteur du terminal moins le chrome (titre, barre, hints)
	// ponytail: marge fixe de 8 lignes, ajuster si le chrome grossit
	const rows = Math.max(1, (stdout?.rows ?? 24) - 8);
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

	// --- Bascule Tab (tâches ⇄ notes). '[9u' = Tab si le protocole kitty le remappe. ---
	useInput(
		(input, key) => {
			if (key.tab || input === '[9u') {
				setWorld(w => (w === 'tasks' ? 'notes' : 'tasks'));
				setMode('input');
			}
		},
		{isActive: !sweeping},
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

				return; // tout le reste de la frappe est géré par le TextInput focus
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
		{isActive: world === 'tasks' && !sweeping},
	);

	// --- Monde NOTES : ↑ sort de la barre vers la nav (draft conservé) ---
	useInput(
		(input, key) => {
			if (key.upArrow && noteList.length > 0) {
				setNoteSelected(noteList.length - 1);
				setMode('nav');
			}
		},
		{isActive: world === 'notes' && mode === 'input' && !sweeping},
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
		{isActive: world === 'notes' && mode === 'nav' && !sweeping},
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

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>
				🧠 brain{'  '}
				<Text color={world === 'tasks' ? 'green' : 'magenta'}>
					{world === 'tasks' ? '[tâches]' : '[notes]'}
				</Text>
				<Text dimColor> · Tab pour changer</Text>
			</Text>
			{loadError && <Text color="red">{loadError}</Text>}

			{world === 'tasks' ? (
				<TasksBody
					visible={visible}
					shown={shown}
					start={start}
					end={end}
					due={view.due}
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
			)}

			<Box marginTop={1}>
				{world === 'tasks' && mode === 'reminder' ? (
					<Box flexDirection="column">
						<Text color="cyan">⏰ rappel</Text>
						<Text>◀ {reminderValue ?? today} ▶</Text>
						<Text dimColor>
							←/→ ±1 j · ↑/↓ ±1 sem · ⌫ retirer · ↵ ok · esc annuler
						</Text>
					</Box>
				) : world === 'tasks' ? (
					<Box>
						<Text color="green">{editingId ? '✎ ' : '› '}[tâche] </Text>
						<TextInput
							value={draft}
							onChange={setDraft}
							onSubmit={submitInput}
							focus={mode === 'input'}
							placeholder="capturer une tâche / un feedback…"
						/>
					</Box>
				) : (
					<Box>
						<Text color="magenta">{editingNoteId ? '✎ ' : '› '}[note] </Text>
						<MultilineInput
							value={noteDraft}
							onChange={setNoteDraft}
							onSubmit={submitNote}
							onCancel={cancelNote}
							focus={mode === 'input'}
							placeholder="capturer une note…"
						/>
					</Box>
				)}
			</Box>

			<Box marginTop={1}>
				<Text dimColor>{hint(world, mode)}</Text>
			</Box>
		</Box>
	);
}

function hint(world: World, mode: Mode): string {
	if (world === 'tasks') {
		if (mode === 'input') return 'Entrée: ajouter · ↑: naviguer · Tab: notes';
		if (mode === 'nav') {
			return '↑/↓ · Espace: fait · r: rappel · e: éditer · d: suppr · Échap: saisie';
		}

		return '';
	}

	if (mode === 'input') {
		return 'Entrée: ajouter · Shift+Entrée: ligne · ↑: naviguer · Tab: tâches';
	}

	return '↑/↓ · p: épingler · e: éditer · d: suppr · Échap: saisie · Tab: tâches';
}

function TasksBody({
	visible,
	shown,
	start,
	end,
	due,
	today,
	active,
	selectedId,
}: {
	visible: Item[];
	shown: Item[];
	start: number;
	end: number;
	due: Item[];
	today: string;
	active: boolean;
	selectedId: string | undefined;
}) {
	return (
		<Box flexDirection="column">
			{visible.length === 0 && (
				<Text dimColor>
					Rien pour l'instant. Écris ci-dessous pour capturer.
				</Text>
			)}
			{start > 0 && <Text dimColor>▲ {start} de plus</Text>}
			{due.length > 0 && start === 0 && (
				<Text color="yellow">— Ressort aujourd'hui —</Text>
			)}
			{shown.map(it => (
				<Row
					key={it.id}
					item={it}
					today={today}
					selected={active && selectedId === it.id}
				/>
			))}
			{end < visible.length && (
				<Text dimColor>▼ {visible.length - end} de plus</Text>
			)}
		</Box>
	);
}

function NotesBody({
	list,
	shown,
	start,
	end,
	active,
	selectedId,
}: {
	list: Note[];
	shown: Note[];
	start: number;
	end: number;
	active: boolean;
	selectedId: string | undefined;
}) {
	return (
		<Box flexDirection="column">
			{list.length === 0 && (
				<Text dimColor>
					Aucune note. Écris ci-dessous, ou Tab pour les tâches.
				</Text>
			)}
			{start > 0 && <Text dimColor>▲ {start} de plus</Text>}
			{shown.map(note => (
				<NoteRow
					key={note.id}
					note={note}
					selected={active && selectedId === note.id}
				/>
			))}
			{end < list.length && <Text dimColor>▼ {list.length - end} de plus</Text>}
		</Box>
	);
}

function Row({
	item,
	today,
	selected,
}: {
	item: Item;
	today: string;
	selected: boolean;
}) {
	const due = isDue(item, today);
	return (
		<Text color={due ? 'yellow' : undefined} inverse={selected}>
			{selected ? '❯ ' : '  '}
			{item.text}
			{item.remindOn ? `  (⏰ ${item.remindOn})` : ''}
		</Text>
	);
}

function NoteRow({note, selected}: {note: Note; selected: boolean}) {
	const lines = note.text.split('\n');
	const extra = lines.length - 1;
	// sélectionnée → corps complet ; sinon 1ʳᵉ ligne + indicateur multi-ligne
	const body = selected
		? note.text
		: lines[0] + (extra > 0 ? `  ↵ +${extra}` : '');
	return (
		<Text inverse={selected}>
			{selected ? '❯ ' : '  '}
			{note.pinned ? '📌 ' : ''}
			{body}
		</Text>
	);
}

function SweepView({
	list,
	mode,
	index,
	loadError,
}: {
	list: Note[];
	mode: 'bulk' | 'review';
	index: number;
	loadError: string | null;
}) {
	const current = list[index];
	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>🧠 brain · ménage des notes</Text>
			{loadError && <Text color="red">{loadError}</Text>}
			{mode === 'bulk' ? (
				<Box flexDirection="column" marginTop={1}>
					<Text color="yellow">
						{list.length} note{list.length > 1 ? 's' : ''} de plus d'une semaine
						:
					</Text>
					{list.slice(0, 8).map(note => (
						<Text key={note.id} dimColor>
							{'  · '}
							{note.text.split('\n')[0]}
						</Text>
					))}
					{list.length > 8 && (
						<Text dimColor>
							{'  '}… et {list.length - 8} autres
						</Text>
					)}
					<Box marginTop={1}>
						<Text dimColor>
							[d] tout supprimer · [k] tout garder · [r] passer en revue
						</Text>
					</Box>
				</Box>
			) : (
				<Box flexDirection="column" marginTop={1}>
					<Text color="yellow">
						Note {index + 1}/{list.length} :
					</Text>
					<Text>{current?.text ?? ''}</Text>
					<Box marginTop={1}>
						<Text dimColor>[k] garder · [d] supprimer · [p] épingler</Text>
					</Box>
				</Box>
			)}
		</Box>
	);
}
