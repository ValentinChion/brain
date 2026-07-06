const two = (n: number) => String(n).padStart(2, '0');

export function todayYMD(d: Date): string {
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export function addDays(ymd: string, n: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	const dt = new Date(y, m - 1, d + n);
	return todayYMD(dt);
}

export function stepReminder(
	current: string | null,
	unit: 'day' | 'week',
	dir: -1 | 1,
	todayYmd: string,
): string {
	const base = current ?? todayYmd;
	const next = addDays(base, (unit === 'week' ? 7 : 1) * dir);
	// plancher : un rappel dans le passé n'a pas de sens (il serait « dû » tout de suite)
	return next < todayYmd ? todayYmd : next;
}
