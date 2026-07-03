import React, {useState} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import TextInput from 'ink-text-input';
import type {Item} from './types.ts';
import {todayYMD, stepReminder} from './date.ts';
import {buildView, isDue, windowView} from './view.ts';
import {addItem, editText, setDone, setReminder, removeItem} from './items.ts';
import {load, save} from './storage.ts';

type Mode = 'input' | 'nav' | 'reminder';

const nowISO = () => new Date().toISOString();

export default function App() {
	const initial = load();
	const [items, setItems] = useState<Item[]>(initial.items);
	const [loadError] = useState<string | null>(initial.error);
	const [mode, setMode] = useState<Mode>('input');
	const [draft, setDraft] = useState('');
	const [reminderValue, setReminderValue] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [selected, setSelected] = useState(0);

	const {stdout} = useStdout();

	const today = todayYMD(new Date()); // recalculé à chaque render (donc à chaque frappe)
	const view = buildView(items, today);
	const visible = [...view.due, ...view.active]; // ordre affiché = ordre navigable
	const clampedSel = Math.min(selected, Math.max(0, visible.length - 1));

	// fenêtre de scroll : hauteur du terminal moins le chrome (titre, barre, hints)
	// ponytail: marge fixe de 8 lignes, ajuster si le chrome grossit
	const rows = Math.max(1, (stdout?.rows ?? 24) - 8);
	const {start, end} = windowView(visible.length, clampedSel, rows);
	const shown = visible.slice(start, end);

	// persiste à chaque changement
	const commit = (next: Item[]) => {
		setItems(next);
		save(next);
	};

	useInput((input, key) => {
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
	});

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

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>🧠 brain</Text>
			{loadError && <Text color="red">{loadError}</Text>}

			{visible.length === 0 && (
				<Text dimColor>
					Rien pour l'instant. Écris ci-dessous pour capturer.
				</Text>
			)}

			{start > 0 && <Text dimColor>▲ {start} de plus</Text>}
			{view.due.length > 0 && start === 0 && (
				<Text color="yellow">— Ressort aujourd'hui —</Text>
			)}
			{shown.map(it => (
				<Row
					key={it.id}
					item={it}
					today={today}
					selected={mode !== 'input' && visible[clampedSel]?.id === it.id}
				/>
			))}
			{end < visible.length && (
				<Text dimColor>▼ {visible.length - end} de plus</Text>
			)}

			<Box marginTop={1}>
				{mode === 'reminder' ? (
					<Box flexDirection="column">
						<Text color="cyan">⏰ rappel</Text>
						<Text>◀ {reminderValue ?? today} ▶</Text>
						<Text dimColor>
							←/→ ±1 j · ↑/↓ ±1 sem · ⌫ retirer · ↵ ok · esc annuler
						</Text>
					</Box>
				) : (
					<Box>
						<Text color="green">{editingId ? '✎ ' : '› '}</Text>
						<TextInput
							value={draft}
							onChange={setDraft}
							onSubmit={submitInput}
							focus={mode === 'input'}
							placeholder="capturer une tâche / un feedback…"
						/>
					</Box>
				)}
			</Box>

			<Box marginTop={1}>
				<Text dimColor>
					{mode === 'input'
						? 'Entrée: ajouter · ↑: naviguer'
						: mode === 'nav'
						? '↑/↓: naviguer · Espace: fait · r: rappel · e: éditer · d: suppr · Échap: saisie'
						: ''}
				</Text>
			</Box>
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
