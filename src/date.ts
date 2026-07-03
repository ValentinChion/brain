const two = (n: number) => String(n).padStart(2, '0');

export function todayYMD(d: Date): string {
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export function addDays(ymd: string, n: number): string {
	const [y, m, d] = ymd.split('-').map(Number);
	const dt = new Date(y, m - 1, d + n);
	return todayYMD(dt);
}

function isRealDate(ymd: string): boolean {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
	if (!m) return false;
	const [, y, mo, d] = m.map(Number);
	const dt = new Date(y, mo - 1, d);
	return (
		dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
	);
}

export function parseReminder(
	input: string,
	todayYmd: string,
): {ok: true; value: string | null} | {ok: false; error: string} {
	const s = input.trim().toLowerCase();
	if (s === '') return {ok: true, value: null};
	if (s === "aujourd'hui" || s === 'aujourdhui')
		return {ok: true, value: todayYmd};
	if (s === 'demain') return {ok: true, value: addDays(todayYmd, 1)};
	if (isRealDate(s)) return {ok: true, value: s};
	return {
		ok: false,
		error: "Format attendu : AAAA-MM-JJ, « aujourd'hui » ou « demain ».",
	};
}
