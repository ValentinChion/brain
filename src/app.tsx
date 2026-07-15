import React, {useState, useEffect, useRef} from 'react';
import {Box, useInput, useWindowSize, useApp} from 'ink';
import type {Item, Note, Meeting} from './core/types.ts';
import {todayYMD, stepReminder} from './core/date.ts';
import {buildView, windowView, listRows, wrappedRows} from './core/view.ts';
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
	loadMeta,
	saveMeta,
	appendJournal,
	readJournal,
	backfillJournal,
} from './core/storage.ts';
import {computeStats, type Stats} from './core/stats.ts';
import {CHANGELOG, changelogLines} from './core/changelog.ts';
import {
	pendingDebriefs,
	linesToItems,
	pruneHandled,
	lastDebriefable,
} from './core/debrief.ts';
import {notifyMeetingEnded} from './core/notify.ts';
import {worldColor} from './core/theme.ts';
import {parseCommand, matchCommands} from './core/commands.ts';
import {isCtrlC} from './core/multiline.ts';
import {
	connect,
	fetchTodaysEvents,
	isConnected,
	openBrowser,
} from './core/google-client.ts';
import {
	isAzureConnected,
	requestDeviceCode,
	pollDeviceToken,
	fetchActionablePrs,
} from './core/azure-client.ts';
import {loadAzureConfig, saveAzureConfig} from './core/azure-config.ts';
import {groupPrs, type PrItem, type PrKind} from './core/forge.ts';
import PrSection, {type AzState} from './components/molecules/pr-section.tsx';
import TasksBody from './components/organisms/tasks-body.tsx';
import NotesBody from './components/organisms/notes-body.tsx';
import SweepView from './components/organisms/sweep-view.tsx';
import ChangelogView from './components/organisms/changelog-view.tsx';
import StatsScreen from './components/templates/stats-screen.tsx';
import ConnectPrompt from './components/organisms/connect-prompt.tsx';
import DebriefView from './components/organisms/debrief-view.tsx';
import InputBar from './components/molecules/input-bar.tsx';
import CommandMenu from './components/molecules/command-menu.tsx';
import ReminderStepper from './components/molecules/reminder-stepper.tsx';
import HintBar from './components/molecules/hint-bar.tsx';
import AgendaStatus, {
	type ConnState,
} from './components/molecules/agenda-status.tsx';
import AppLayout from './components/templates/app-layout.tsx';

type Mode = 'input' | 'nav' | 'reminder' | 'prnav';
type World = 'tasks' | 'notes';

const nowISO = () => new Date().toISOString();

export default function App() {
	// useState(fn) = init paresseuse : une seule lecture disque au montage
	// (un appel direct relirait les JSON à chaque render, donc à chaque frappe)
	const [initial] = useState(load);
	const [initialNotes] = useState(loadNotes);
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
	const [menuIndex, setMenuIndex] = useState(0);

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

	// --- changelog : takeover post-mise-à-jour + vue /changelog ---
	const [initialMeta] = useState(loadMeta);
	const [changelogOpen, setChangelogOpen] = useState<
		'update' | 'manual' | null
	>(
		initialMeta.lastSeenVersion &&
			initialMeta.lastSeenVersion !== CHANGELOG[0].version
			? 'update'
			: null,
	);
	const [clOffset, setClOffset] = useState(0);

	// première installation : rien à annoncer, on enregistre juste la version courante
	useEffect(() => {
		if (!initialMeta.lastSeenVersion)
			saveMeta({...initialMeta, lastSeenVersion: CHANGELOG[0].version});
	}, [initialMeta]);

	// --- écran /stats (journal append-only) ---
	const [statsData, setStatsData] = useState<Stats | null>(null);

	// backfill au démarrage (pas au premier /stats) : un journal absent est
	// reconstruit depuis les données existantes avant tout append
	useEffect(() => {
		backfillJournal(initial.items, initialNotes.notes);
	}, [initial, initialNotes]);

	const closeChangelog = () => {
		saveMeta({...loadMeta(), lastSeenVersion: CHANGELOG[0].version});
		setChangelogOpen(null);
		setClOffset(0);
	};

	// --- miroir PRs Azure DevOps (lecture seule, la forge est la vérité) ---
	const [azState, setAzState] = useState<AzState>(() =>
		isAzureConnected() && loadAzureConfig() ? 'connected' : 'off',
	);
	const [azCode, setAzCode] = useState<string | null>(null);
	const [azError, setAzError] = useState<string | null>(null);
	const [prs, setPrs] = useState<PrItem[]>([]);
	// L'identité d'un groupe est son genre, jamais son index : un sondage peut le
	// faire disparaître (une PR approuvée pendant qu'on la regarde). Le focus et
	// le dépli sont donc résolus à chaque rendu contre les groupes courants.
	const [prFocus, setPrFocus] = useState<PrKind | null>(null);
	const [prExpanded, setPrExpanded] = useState(false);
	const [prSelected, setPrSelected] = useState(0);

	const refreshPrs = async () => {
		try {
			setPrs(await fetchActionablePrs());
			setAzError(null);
		} catch (error: unknown) {
			// on garde les dernières données valides ; statut discret dans la section
			setAzError(error instanceof Error ? error.message : String(error));
		}
	};

	// sondage : immédiat à la connexion, puis toutes les 5 min (même cadence que l'agenda)
	useEffect(() => {
		if (azState !== 'connected') return;
		void refreshPrs();
		const id = setInterval(() => {
			void refreshPrs();
		}, 5 * 60 * 1000);
		return () => {
			clearInterval(id);
		};
	}, [azState]);

	const runAzure = async (args: string[]) => {
		if (args.length >= 2) {
			// le nom de projet peut contenir des espaces (« B2B Portal ») :
			// tout ce qui suit l'organisation est le projet
			saveAzureConfig({
				organization: args[0],
				project: args.slice(1).join(' '),
			});
		}

		if (!loadAzureConfig()) {
			setAzState('error');
			setAzError('usage : /azure <organisation> <projet>');
			return;
		}

		try {
			setAzError(null);
			const dc = await requestDeviceCode();
			setAzCode(`entre ${dc.userCode} sur ${dc.verificationUri}`);
			setAzState('code');
			await pollDeviceToken(dc);
			setAzCode(null);
			setAzState('connected'); // déclenche le sondage ci-dessus
		} catch (error: unknown) {
			setAzCode(null);
			setAzState('error');
			setAzError(error instanceof Error ? error.message : String(error));
		}
	};

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

	// dispatch d'une commande de la barre (`/gauth`, `/debrief`, `/azure`, `/prs`, `/changelog`, `/stats`)
	const runCommand = (name: string, args: string[]) => {
		if (name === 'gauth') void runConnect();
		if (name === 'debrief') runDebrief();
		if (name === 'azure') void runAzure(args);
		if (name === 'prs') void refreshPrs();
		if (name === 'changelog') setChangelogOpen('manual');
		// stats calculées à l'ouverture : état mémoire + lecture du journal
		if (name === 'stats')
			setStatsData(computeStats(readJournal(), items, notes, today));
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
				for (const l of lines) {
					next = addItem(next, l, nowISO(), head.title);
					appendJournal({t: 'task', d: today});
				}

				commit(next);
			}

			setDebriefPhase('infos');
			setDebriefDraft('');
			return;
		}

		if (lines.length > 0) {
			let next = notes;
			for (const l of lines) {
				next = addNote(next, l, nowISO(), head.title);
				appendJournal({t: 'note', d: today});
			}

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

	const {exit} = useApp();

	// Ctrl+C quitte toujours. C'est LE point de sortie : exitOnCtrlC est désactivé
	// dans cli.tsx (la détection interne d'Ink 7 ne reconnaît pas la forme kitty
	// et avale la touche). isCtrlC couvre les deux formes (ctrl+'c' parsé, CSI brut).
	useInput((input, key) => {
		if (isCtrlC(input, key)) exit();
	});

	// dimensions du terminal, re-rendues sur resize (le split Ghostty bouge souvent)
	const {rows: termRows, columns: cols} = useWindowSize();

	const today = todayYMD(new Date()); // recalculé à chaque render (donc à chaque frappe)
	const view = buildView(items, today);
	const visible = [...view.due, ...view.active]; // ordre affiché = ordre navigable
	const clampedSel = Math.min(selected, Math.max(0, visible.length - 1));

	const noteList = sortNotes(notes);
	const noteSel = Math.min(noteSelected, Math.max(0, noteList.length - 1));

	// --- dérivés PR : purs, recalculés à chaque rendu contre des `prs` frais.
	// Si le genre focusé a disparu (dernière PR traitée), on retombe sur le
	// premier groupe et le dépli s'annule tout seul — sans effet ni setState. ---
	const groups = groupPrs(prs);
	const focusIdx = Math.max(
		0,
		groups.findIndex(g => g.kind === prFocus),
	);
	const openGroup = prExpanded ? groups[focusIdx] : undefined;
	const prExpandedNow = Boolean(openGroup);
	const prSel = openGroup
		? Math.min(prSelected, openGroup.items.length - 1)
		: 0;

	// --- ligne sélectionnée dépliée : la liste tronque, la sélection montre tout.
	// Les mesures reflètent la composition des composants (row/note-row/pr-section) ;
	// approximation ligne rendue ≈ texte + suffixes, gouttière déduite de la largeur.
	const selTask =
		world === 'tasks' && mode !== 'input' ? visible[clampedSel] : undefined;
	const taskExtra = selTask
		? wrappedRows(
				selTask.text +
					(selTask.remindOn ? `  ·${selTask.remindOn.slice(5)}` : '') +
					(selTask.source ? `  · ${selTask.source}` : ''),
				cols - 2,
		  ) - 1
		: 0;
	const selNote =
		world === 'notes' && mode !== 'input' ? noteList[noteSel] : undefined;
	const noteExtra = selNote
		? wrappedRows(
				selNote.text + (selNote.source ? `  · ${selNote.source}` : ''),
				cols - 3,
		  ) - 1
		: 0;
	const selPr = openGroup?.items[prSel];
	// largeur utile dans un panneau : bordures 2 + paddingX 1×2 + paddingX
	// d'AppLayout 1×2 = 6 ; moins la gouttière « ❯ ⇄ » ≈ 4.
	const prExtra = selPr
		? wrappedRows(`${selPr.title} (${selPr.author}) · 99j`, cols - 10) - 1
		: 0;

	// le panneau PR existe sauf : Azure éteint, ou connecté sans PR ni erreur
	const prPanel =
		azState !== 'off' &&
		(azState !== 'connected' || groups.length > 0 || Boolean(azError));
	const prRows = prPanel
		? openGroup
			? 3 + openGroup.items.length + prExtra // bordures 2 + compteurs 1 + items
			: 3 + (azState === 'connected' && azError ? 1 : 0)
		: 0;
	// chrome hors liste, compté ligne à ligne : masthead (+marge), erreur éventuelle,
	// statut agenda+PRs (+marge), saisie (+marge, peut grandir en multi-lignes),
	// hints (+marge), padding bas. Si ce décompte dévie du JSX d'AppLayout, la liste
	// déborde du terminal et tout scrolle.
	// menu de commandes : ouvert seulement en mode saisie, pendant la frappe du nom
	const menuMatches =
		mode === 'input'
			? matchCommands(world === 'tasks' ? draft : noteDraft)
			: [];
	const menuOpen = menuMatches.length > 0;
	const menuSel = Math.min(menuIndex, Math.max(0, menuMatches.length - 1));
	const footerRows =
		mode === 'reminder'
			? 3
			: (world === 'tasks' ? draft : noteDraft).split('\n').length +
			  menuMatches.length;
	//   6 masthead (sprite 4 + filet 1 + marge 1)
	//   2 bordures du panneau du corps
	const chrome =
		6 + (loadError ? 1 : 0) + (2 + prRows) + 2 + (1 + footerRows) + 2 + 1;
	const taskRows = listRows(
		termRows,
		// + entête « N ressortent » éventuel + lignes de la sélection dépliée
		chrome + (view.due.length > 0 ? 1 : 0) + taskExtra,
		visible.length,
	);
	const {start, end} = windowView(visible.length, clampedSel, taskRows);
	const shown = visible.slice(start, end);
	const noteRows = listRows(termRows, chrome + noteExtra, noteList.length);
	const noteWin = windowView(noteList.length, noteSel, noteRows);
	const shownNotes = noteList.slice(noteWin.start, noteWin.end);

	// la sélection revient en tête à chaque frappe qui modifie le texte
	const changeDraft = (v: string) => {
		setDraft(v);
		setMenuIndex(0);
	};

	const changeNoteDraft = (v: string) => {
		setNoteDraft(v);
		setMenuIndex(0);
	};

	const menuUp = () => {
		setMenuIndex(Math.max(0, menuSel - 1));
	};

	const menuDown = () => {
		setMenuIndex(Math.min(menuMatches.length - 1, menuSel + 1));
	};

	// Tab : complète le nom sélectionné dans la saisie (espace final → place aux args)
	const completeCommand = () => {
		const sel = menuMatches[menuSel];
		if (!sel) return;
		const next = '/' + sel.name + ' ';
		if (world === 'tasks') setDraft(next);
		else setNoteDraft(next);
	};

	// Échap : vide le brouillon, ce qui ferme le menu
	const clearMenuDraft = () => {
		if (world === 'tasks') setDraft('');
		else setNoteDraft('');
	};

	// persiste à chaque changement
	const commit = (next: Item[]) => {
		setItems(next);
		save(next);
	};

	const commitNotes = (next: Note[]) => {
		setNotes(next);
		saveNotes(next);
	};

	const blocked =
		sweeping ||
		connectPromptOpen ||
		debriefQueue.length > 0 ||
		changelogOpen !== null ||
		statsData !== null;

	// --- Vue changelog : takeover = dernière version seulement ; /changelog = historique ---
	const clLines =
		changelogOpen === 'manual'
			? changelogLines(CHANGELOG)
			: changelogLines([CHANGELOG[0]]);
	// chrome de ChangelogView : masthead + hints + padding ; listRows réserve les indicateurs ▲/▼
	const clRows = listRows(termRows, 8, clLines.length);

	useInput(
		(input, key) => {
			if (key.escape || key.return) {
				closeChangelog();
			} else if (key.downArrow) {
				setClOffset(o => Math.min(o + 1, Math.max(0, clLines.length - clRows)));
			} else if (key.upArrow) {
				setClOffset(o => Math.max(0, o - 1));
			}
		},
		{
			isActive:
				changelogOpen !== null && !sweeping && !connectPromptOpen && !head,
		},
	);

	// --- Écran /stats : reste affiché jusqu'à Échap ---
	useInput(
		(input, key) => {
			if (key.escape) setStatsData(null);
		},
		{
			isActive:
				statsData !== null &&
				!sweeping &&
				!connectPromptOpen &&
				!head &&
				changelogOpen === null,
		},
	);

	// --- Prompt de connexion agenda au démarrage (s'affiche après le ménage) ---
	useInput(
		(input, key) => {
			if (input === 'o' || key.return) void runConnect();
			else if (input === 'n' || key.escape) setConnectPromptOpen(false);
		},
		{isActive: connectPromptOpen && !sweeping},
	);

	// --- Bascule Tab (tâches ⇄ notes). '[9u' = repli si la séquence kitty arrive brute.
	// Inactif en mode rappel : Tab n'abandonne pas silencieusement le stepper. ---
	useInput(
		(input, key) => {
			if (key.tab || input === '[9u') {
				if (menuOpen) {
					completeCommand();
					return;
				}

				setWorld(w => (w === 'tasks' ? 'notes' : 'tasks'));
				setMode('input');
			}
		},
		{isActive: !blocked && mode !== 'reminder'},
	);

	// --- Monde TÂCHES (logique v1 inchangée : input / nav / reminder-stepper) ---
	useInput(
		(input, key) => {
			if (mode === 'input') {
				return; // toute la frappe (dont ↑/↓) est gérée par le MultilineInput focus
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
				// Maj+↑/↓ : saut de section, quelle que soit la ligne — ↑ vers le
				// panneau PR (s'il existe), ↓ vers la saisie.
				if (key.shift && (key.upArrow || key.downArrow)) {
					if (key.upArrow) {
						if (groups.length > 0 && azState === 'connected') {
							setPrFocus(groups[0].kind);
							setPrExpanded(false);
							setMode('prnav');
						}
					} else {
						setMode('input');
					}

					return;
				}

				if (key.downArrow) {
					if (clampedSel >= visible.length - 1) setMode('input');
					else setSelected(clampedSel + 1);
				} else if (key.upArrow) {
					// le panneau PR n'est navigable que s'il affiche ses compteurs
					// (état connecté) — sinon on naviguerait des lignes invisibles
					if (
						clampedSel === 0 &&
						groups.length > 0 &&
						azState === 'connected'
					) {
						// premier compteur : pas de « plus proche » sur un axe horizontal
						setPrFocus(groups[0].kind);
						setPrExpanded(false);
						setMode('prnav');
					} else {
						setSelected(Math.max(0, clampedSel - 1));
					}
				} else if (key.escape) {
					setMode('input');
				} else if (visible.length > 0) {
					const target = visible[clampedSel];
					if (input === ' ') {
						commit(setDone(items, target.id, !target.done, nowISO()));
						appendJournal({t: target.done ? 'undone' : 'done', d: today});
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

	// --- Panneau PR : un seul curseur, deux axes qui ne se recouvrent jamais.
	// ←/→ changent de groupe (et déplient le voisin si on était déplié) ;
	// ↑/↓ n'existent que déplié, dans les items. La ligne des compteurs n'est
	// jamais focusable, donc `Entrée` n'est jamais ambigu. ---
	useInput(
		(input, key) => {
			if (groups.length === 0) {
				setMode('input');
				return;
			}

			// Maj+↓ : saut de section vers les tâches (ou la saisie s'il n'y en a
			// pas). Maj+↑ : le panneau PR est déjà la section du haut → rien.
			if (key.shift && (key.upArrow || key.downArrow)) {
				if (key.downArrow) {
					setPrExpanded(false);
					if (visible.length > 0) {
						setSelected(0);
						setMode('nav');
					} else {
						setMode('input');
					}
				}

				return;
			}

			if (key.escape) {
				if (prExpandedNow) setPrExpanded(false);
				else setMode('input');
			} else if (key.leftArrow || key.rightArrow) {
				const next = Math.min(
					groups.length - 1,
					Math.max(0, focusIdx + (key.rightArrow ? 1 : -1)),
				);
				setPrFocus(groups[next].kind);
				setPrSelected(0);
			} else if (key.downArrow) {
				// déplié : on descend dans les items, puis on tombe dans les tâches
				if (openGroup && prSel < openGroup.items.length - 1) {
					setPrSelected(prSel + 1);
				} else {
					setPrExpanded(false);
					setSelected(0);
					setMode('nav');
				}
			} else if (key.upArrow && openGroup) {
				setPrSelected(Math.max(0, prSel - 1));
			} else if (key.return && !prExpandedNow) {
				setPrFocus(groups[focusIdx].kind);
				setPrExpanded(true);
				setPrSelected(0);
			} else if (prExpandedNow && (key.return || input === 'o') && selPr?.url) {
				openBrowser(selPr.url);
			}
		},
		{isActive: world === 'tasks' && mode === 'prnav' && !blocked},
	);

	// --- Monde NOTES : navigation (p épingler, e éditer, d suppr) ---
	useInput(
		(input, key) => {
			// Maj+↓ : saut vers la saisie. Maj+↑ : notes est la section du haut → rien.
			if (key.shift && (key.upArrow || key.downArrow)) {
				if (key.downArrow) setMode('input');
				return;
			}

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
		// Entrée avec le menu ouvert : exécute la sélection (sans args)
		if (menuOpen) {
			const sel = menuMatches[menuSel];
			if (sel) runCommand(sel.name, []);
			setDraft('');
			return;
		}

		const cmd = parseCommand(value);
		if (cmd) {
			runCommand(cmd.name, cmd.args);
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
			appendJournal({t: 'task', d: today});
		}

		setDraft('');
	};

	const submitNote = (value: string) => {
		// Entrée avec le menu ouvert : exécute la sélection (sans args)
		if (menuOpen) {
			const sel = menuMatches[menuSel];
			if (sel) runCommand(sel.name, []);
			setNoteDraft('');
			return;
		}

		const cmd = parseCommand(value);
		if (cmd) {
			runCommand(cmd.name, cmd.args);
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
			appendJournal({t: 'note', d: today});
		}

		setNoteDraft('');
	};

	const cancelNote = () => {
		setEditingNoteId(null);
		setMode('nav');
	};

	const exitToTaskNav = () => {
		if (visible.length > 0) {
			setSelected(visible.length - 1);
			setMode('nav');
		} else if (groups.length > 0 && azState === 'connected') {
			// pas de tâches mais des PRs : ↑ depuis la saisie doit pouvoir les atteindre
			setPrFocus(groups[0].kind);
			setPrExpanded(false);
			setMode('prnav');
		}
	};

	const exitToNoteNav = () => {
		if (noteList.length > 0) {
			setNoteSelected(noteList.length - 1);
			setMode('nav');
		}
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

	if (changelogOpen) {
		return (
			<ChangelogView
				lines={clLines}
				offset={clOffset}
				rows={clRows}
				loadError={loadError}
			/>
		);
	}

	if (statsData) {
		return (
			<StatsScreen
				stats={statsData}
				prCount={azState === 'connected' ? prs.length : null}
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
				dueCount={view.due.length}
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

	const menuNode = menuOpen ? (
		<CommandMenu
			matches={menuMatches}
			selected={menuSel}
			accent={worldColor(world)}
		/>
	) : null;

	const footer =
		world === 'tasks' && mode === 'reminder' ? (
			<ReminderStepper reminderValue={reminderValue} today={today} />
		) : world === 'tasks' ? (
			<Box flexDirection="column">
				<InputBar
					world="tasks"
					editing={Boolean(editingId)}
					value={draft}
					focus={mode === 'input'}
					placeholder="capturer une tâche / un feedback…"
					onChange={changeDraft}
					onSubmit={submitInput}
					onCancel={menuOpen ? clearMenuDraft : undefined}
					onExitUp={menuOpen ? menuUp : exitToTaskNav}
					onExitDown={menuOpen ? menuDown : undefined}
				/>
				{menuNode}
			</Box>
		) : (
			<Box flexDirection="column">
				<InputBar
					world="notes"
					editing={Boolean(editingNoteId)}
					value={noteDraft}
					focus={mode === 'input'}
					placeholder="capturer une note…"
					onChange={changeNoteDraft}
					onSubmit={submitNote}
					onCancel={menuOpen ? clearMenuDraft : cancelNote}
					onExitUp={menuOpen ? menuUp : exitToNoteNav}
					onExitDown={menuOpen ? menuDown : undefined}
				/>
				{menuNode}
			</Box>
		);

	return (
		<AppLayout
			termRows={termRows}
			label={world === 'tasks' ? 'TÂCHES' : 'NOTES'}
			loadError={loadError}
			status={
				<>
					<AgendaStatus
						state={connState}
						meetings={meetings}
						nowISO={nowISO()}
						error={connectError}
					/>
					<PrSection
						state={azState}
						code={azCode}
						error={azError}
						groups={groups}
						nowISO={nowISO()}
						active={mode === 'prnav'}
						focusIdx={focusIdx}
						expanded={prExpandedNow}
						selected={prSel}
					/>
				</>
			}
			body={body}
			footer={footer}
			hints={
				<HintBar
					world={world}
					mode={mode}
					menuOpen={menuOpen}
					prExpanded={prExpandedNow}
				/>
			}
		/>
	);
}
