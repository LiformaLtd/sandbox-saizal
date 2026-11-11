<script lang="ts">
	let { data } = $props();

	// european = Anna's plate, african = Precious's plate; the rest are made by the script
	const ALL = $derived<string[]>(['european', ...data.races, 'african']);
	let outfit = $state('');
	let chosen = $state<Record<string, boolean>>({});
	// first outfit and every race ticked to start with (data comes from the server load, so this runs once)
	$effect(() => {
		if (!outfit && data.outfits.length) outfit = data.outfits[0];
		for (const r of ALL) if (!(r in chosen)) chosen[r] = true;
	});
	let fixes = $state(true);
	// overlay: one plate on top of another, to compare outlines (neck length, shoulders...)
	let overlayOn = $state(false);
	let baseLabel = $state('');
	let topLabel = $state('');
	let topOpacity = $state(50);
	let blend = $state<'normal' | 'difference'>('normal');
	let zoom = $state(1);
	let busy = $state(false);
	let error = $state('');
	let result = $state<any>(null);

	async function make() {
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/make', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ outfit, races: data.races.filter((r: string) => chosen[r]), fixes, endpointsOnly: !data.races.some((r: string) => chosen[r]) })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? res.statusText);
			result = body;
			const labels = columns(result).map((c) => c.label);
			if (!labels.includes(baseLabel)) baseLabel = labels[0] ?? '';
			if (!labels.includes(topLabel) || topLabel === baseLabel) topLabel = labels.find((l) => l !== baseLabel) ?? '';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	/** One column per ticked race, in order: european (Anna) | made races | african (Precious). */
	function columns(r: any) {
		if (!r) return [];
		const cols = [];
		if (chosen.european) cols.push({ label: 'european (Anna)', src: r.images.anna, rep: null });
		for (const [race, src] of Object.entries(r.images.races)) {
			if (chosen[race]) cols.push({ label: race, src: src as string, rep: r.report.plates[race] });
		}
		if (chosen.african) cols.push({ label: 'african (Precious)', src: r.images.precious, rep: null });
		return cols;
	}

	/** File name for a download: <outfit>_<race>.<ext of the served file>. */
	function fileName(c: { label: string; src: string }) {
		const ext = (c.src.split('?')[0].match(/\.(png|webp)$/i) ?? [, 'png'])[1];
		return `${result?.outfit ?? 'plate'}_${c.label.split(' ')[0]}.${ext}`;
	}

	async function downloadAll() {
		for (const c of columns(result)) {
			const a = document.createElement('a');
			a.href = c.src;
			a.download = fileName(c);
			document.body.appendChild(a);
			a.click();
			a.remove();
			await new Promise((r) => setTimeout(r, 300));
		}
	}

	const shown = $derived(columns(result));
	const baseCol = $derived(shown.find((c) => c.label === baseLabel));
	const topCol = $derived(shown.find((c) => c.label === topLabel));

	function swap() {
		[baseLabel, topLabel] = [topLabel, baseLabel];
	}

	function handsText(rep: any) {
		if (!rep) return '';
		if (typeof rep.hands === 'string') return rep.hands;
		return `hands ${rep.hands.miss.map((v: number) => (v > 0 ? '+' : '') + v).join('/')}` + (rep.hands.problem ? ' — ' + rep.hands.problem : '');
	}
</script>

<main>
	<header>
		<h1>Race plates</h1>
		<p class="muted">
			Anna's plate + Precious's plate of one outfit → the six race plates, made by <code>maker/make_race_plates.py</code>.
			Plates come from <code>plates/</code> (<code>npm run pull</code>), results go to <code>out/</code>.
		</p>
	</header>

	{#if !data.python.ok}
		<p class="error">
			No Python with numpy, scipy and pillow found. Tried: {data.python.candidates.join(', ')}. Set
			<code>RACE_PLATES_PYTHON</code> to one that has them.
		</p>
	{/if}

	{#if data.outfits.length === 0}
		<p class="error">No outfits in <code>plates/anna</code> and <code>plates/precious</code>. Run <code>npm run pull</code> first.</p>
	{/if}

	<section class="controls">
		<label>
			Outfit
			<select bind:value={outfit} disabled={busy}>
				{#each data.outfits as o}
					<option value={o}>{o}</option>
				{/each}
			</select>
		</label>

		<fieldset disabled={busy}>
			<legend>Races</legend>
			{#each ALL as r}
				<label class="check">
					<input type="checkbox" bind:checked={chosen[r]} />
					{r === 'european' ? 'european (Anna)' : r === 'african' ? 'african (Precious)' : r}
				</label>
			{/each}
		</fieldset>

		<label class="check"><input type="checkbox" bind:checked={fixes} disabled={busy} /> edge fixes on</label>

		<button onclick={make} disabled={busy || !outfit || !data.python.ok || !ALL.some((r) => chosen[r])}>{busy ? 'Making…' : 'Make'}</button>
		<span class="muted">{busy ? 'about 5 s per race' : data.python.ok ? `python: ${data.python.python}` : ''}</span>
	</section>

	{#if error}<pre class="error">{error}</pre>{/if}

	{#if result}
		<section class="results">
			<div class="bar">
				<h2>{result.outfit} <span class="muted">— fixes {result.report.fixes}</span></h2>
				<button class="secondary" onclick={downloadAll}>Download all shown</button>
				<label class="check"><input type="checkbox" bind:checked={overlayOn} /> overlay two plates</label>
			</div>

			{#if overlayOn}
				<div class="overlay-controls">
					<label>
						Under
						<select bind:value={baseLabel}>
							{#each shown as c}<option value={c.label}>{c.label}</option>{/each}
						</select>
					</label>
					<button class="secondary" onclick={swap} title="swap under and over">⇅</button>
					<label>
						Over
						<select bind:value={topLabel}>
							{#each shown as c}<option value={c.label}>{c.label}</option>{/each}
						</select>
					</label>
					<label>
						Over plate opacity {topOpacity}%
						<input type="range" min="0" max="100" bind:value={topOpacity} />
					</label>
					<label>
						Blend
						<select bind:value={blend}>
							<option value="normal">normal</option>
							<option value="difference">difference (what differs lights up)</option>
						</select>
					</label>
					<label>
						Zoom {zoom}x
						<input type="range" min="0.5" max="3" step="0.25" bind:value={zoom} />
					</label>
				</div>
				{#if baseCol && topCol}
					<div class="overlay" style="height: min(85vh, {1024 * zoom + 24}px)">
						<div class="stack" style="width: {1024 * zoom}px; height: {1024 * zoom}px">
							<img class="layer" src={baseCol.src} alt={baseCol.label} />
							<img class="layer" src={topCol.src} alt={topCol.label} style="opacity: {topOpacity / 100}; mix-blend-mode: {blend}" />
						</div>
					</div>
				{:else}
					<p class="muted">Pick two of the shown plates.</p>
				{/if}
			{/if}

			<div class="row">
				{#each shown as c (c.label)}
					<figure class:bad={c.rep && !c.rep.ok}>
						<figcaption>
							<strong>{c.label}</strong>
							{#if c.rep}
								<span class={c.rep.ok ? 'ok' : 'error'}>{c.rep.ok ? 'ok' : 'PROBLEM'}</span>
								<small>values {c.rep.values.join(' / ')}</small>
								<small>{handsText(c.rep)}</small>
								{#if c.rep.outline_not_anna_below_neck || c.rep.clothing_changed || c.rep.face_not_exact}
									<small class="error">
										outline {c.rep.outline_not_anna_below_neck}, clothing {c.rep.clothing_changed}, face {c.rep.face_not_exact}
									</small>
								{/if}
							{/if}
						</figcaption>
						<img class="plate" src={c.src} alt={c.label} />
						<a class="download" href={c.src} download={fileName(c)}>Download {fileName(c)}</a>
					</figure>
				{/each}
			</div>
			<details>
				<summary>maker output</summary>
				<pre>{result.log}</pre>
			</details>
		</section>
	{/if}
</main>

<style>
	main {
		padding: 1.25rem 1.5rem 3rem;
		max-width: 100%;
	}
	h1 {
		margin: 0 0 0.25rem;
		font-size: 1.4rem;
	}
	h2 {
		font-size: 1.1rem;
		margin: 1.5rem 0 0.5rem;
	}
	.muted {
		color: var(--muted);
	}
	code {
		color: var(--accent);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1rem 1.5rem;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.9rem 1rem;
	}
	.controls label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.controls label.check,
	fieldset label.check {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
	}
	fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.4rem 0.8rem;
	}
	legend {
		color: var(--muted);
		padding: 0 0.3rem;
	}
	select {
		padding: 0.35rem 0.5rem;
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		min-width: 18rem;
	}
	button {
		padding: 0.45rem 1.1rem;
		background: var(--accent);
		color: #041022;
		border: 0;
		border-radius: 6px;
		font-weight: 600;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.error {
		color: var(--danger);
		white-space: pre-wrap;
	}
	.ok {
		color: var(--ok);
	}
	.row {
		display: flex;
		gap: 0.6rem;
		overflow-x: auto;
		padding-bottom: 0.5rem;
	}
	figure {
		margin: 0;
		flex: 0 0 auto;
		width: min(1040px, calc(50vw - 1.5rem)); /* two plates side by side on any screen, never above their own size */
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	figure.bad {
		border-color: var(--danger);
	}
	figcaption {
		display: flex;
		flex-direction: column;
		font-size: 0.85rem;
		min-height: 4.6rem;
	}
	figcaption small {
		color: var(--muted);
	}
	.plate {
		width: 100%;
		aspect-ratio: 1;
		background: var(--plate-bg);
		border-radius: 6px;
	}
	.download {
		color: var(--accent);
		font-size: 0.85rem;
		text-decoration: none;
	}
	.download:hover {
		text-decoration: underline;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.5rem;
	}
	.bar h2 {
		margin: 0;
	}
	button.secondary {
		background: var(--panel);
		color: var(--text);
		border: 1px solid var(--border);
	}
	.overlay-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem 1.25rem;
		margin: 0.75rem 0;
		padding: 0.75rem 1rem;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.overlay-controls label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.9rem;
	}
	.overlay-controls select {
		min-width: 12rem;
	}
	.overlay {
		overflow: auto;
		margin-bottom: 1rem;
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.stack {
		position: relative;
		isolation: isolate; /* the difference blend stays inside the stack */
		background: var(--plate-bg);
	}
	.layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	details pre {
		font-size: 0.8rem;
		color: var(--muted);
	}
</style>
