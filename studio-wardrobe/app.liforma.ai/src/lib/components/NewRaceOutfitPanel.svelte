<!--
	LOCAL DEV ONLY (2026-10-02): "+ New clothes" for the race-plate characters. The user only ever sees one outfit:
	  1. Generate: the first picture is made (on the light endpoint's bald base) and shown below the neck only, so
	     nobody else's face appears (user, 2026-10-02: "remove the head and just show the plate below neck").
	  2. "Looks good": the dark endpoint's picture is made behind the scenes from it, both are keyed, and the outfit is
	     shown in the character's ethnicity, mixed in this browser like every other outfit.
	The server side is raceOutfitGeneration.ts; user, 2026-10-02: "we don't tell on the UI that we are generating a
	European plate, then African plate".
-->
<script module lang="ts">
	/**
	 * The draft being worked on per avatar, kept for the browser tab so closing the window or reloading the page does
	 * not lose a generation that is waiting for a GPU (the draft itself lives on the server).
	 */
	const DRAFT_KEY = 'liforma.newOutfitDraft.';

	function rememberedDraft(avatarId: string): string {
		try {
			return sessionStorage.getItem(DRAFT_KEY + avatarId) ?? '';
		} catch {
			return '';
		}
	}

	function rememberDraft(avatarId: string, id: string | null) {
		try {
			if (id) sessionStorage.setItem(DRAFT_KEY + avatarId, id);
			else sessionStorage.removeItem(DRAFT_KEY + avatarId);
		} catch {
			/* storage unavailable: the draft is only kept while the window is open */
		}
	}
</script>

<script lang="ts">
	import { AVATAR_RACE_SET, racePlate } from '$lib/raceOutfits/racePlates.svelte';
	import { makeBodyPreviewInWorker } from '$lib/raceOutfits/racePlatePool';

	type StepView = {
		status: 'idle' | 'running' | 'keying' | 'ready' | 'failed';
		attempts: number;
		gpu?: 'hpc' | 'orchestrator';
		jobStatus?: string;
		error?: string;
	};
	type DraftView = {
		id: string;
		description: string;
		european: StepView;
		african: StepView;
		outfit: string | null;
	};

	type Props = {
		avatarId: string;
		/** The character's ethnicity: the finished outfit is shown in it. */
		race: string;
		onBack: () => void;
		/** A finished outfit is in the store (replacing an earlier one made from the same approved picture). */
		onMade: (outfit: string, replaces: string | null) => void;
		onWear: (outfit: string) => void;
	};

	let { avatarId, race, onBack, onMade, onWear }: Props = $props();

	let description = $state('');
	let draft = $state<DraftView | null>(null);
	let busy = $state(false);
	let errorMessage = $state('');
	/** The first picture below the neck (no head), for approval. */
	let preview = $state<{ key: string; url: string; error: string }>({ key: '', url: '', error: '' });
	/** The outfit last reported to the page, so a remake can replace it. */
	let reported: string | null = null;

	const BUSY = ['running', 'keying'];
	const working = $derived(
		draft !== null && (BUSY.includes(draft.european.status) || BUSY.includes(draft.african.status))
	);
	const stage = $derived.by(() => {
		if (!draft) return 'describe';
		if (draft.european.status !== 'ready') return 'first';
		if (draft.african.status === 'idle') return 'check';
		if (draft.african.status === 'ready' && draft.outfit) return 'done';
		return 'finishing';
	});
	const finished = $derived(draft?.outfit ? racePlate(race, draft.outfit, true) : null);
	const shownUrl = $derived.by(() => {
		if (stage === 'done' && finished?.ready) return finished.url;
		return stage === 'check' || stage === 'finishing' || stage === 'done' ? preview.url : '';
	});
	const waiting = $derived.by(() => {
		if (!draft) return '';
		if (BUSY.includes(draft.european.status)) return 'Generating the outfit…' + queueNote(draft.european);
		if (BUSY.includes(draft.african.status)) return 'Finishing the outfit…' + queueNote(draft.african);
		if (stage === 'done' && finished && !finished.ready && !finished.error) return 'Finishing the outfit…';
		if (stage !== 'describe' && stage !== 'first' && !preview.url && !preview.error) return 'Getting it ready…';
		return '';
	});
	const problem = $derived(
		errorMessage ||
			draft?.african.error ||
			draft?.european.error ||
			(stage === 'done' && finished?.error ? finished.error : '') ||
			preview.error
	);

	function queueNote(step: StepView): string {
		if (step.status !== 'running' || step.jobStatus !== 'queued') return '';
		return step.gpu === 'hpc' ? ' Waiting for the GPU.' : ' Waiting for a GPU; the first one can take a few minutes.';
	}

	function firstPictureUrl(d: DraftView): string {
		return `/library/race-outfits/generate/${d.id}/image?step=european&a=${d.european.attempts}`;
	}

	// the first picture is shown below the neck only (made in a worker, kept only as an object URL)
	$effect(() => {
		if (!draft || draft.european.status !== 'ready') return;
		const key = `${draft.id}|${draft.european.attempts}`;
		if (preview.key === key) return;
		const set = AVATAR_RACE_SET[avatarId] ?? 'female';
		const old = preview.url;
		preview = { key, url: '', error: '' };
		if (old) URL.revokeObjectURL(old);
		makeBodyPreviewInWorker(firstPictureUrl(draft), set)
			.then(({ blob }) => {
				if (preview.key === key) preview = { key, url: URL.createObjectURL(blob), error: '' };
			})
			.catch((e: unknown) => {
				if (preview.key === key) preview = { key, url: '', error: e instanceof Error ? e.message : String(e) };
			});
	});

	$effect(() => () => {
		if (preview.url) URL.revokeObjectURL(preview.url);
	});

	async function call(url: string, init?: Parameters<typeof fetch>[1]): Promise<DraftView> {
		const res = await fetch(url, init);
		const body = await res.json().catch(() => null);
		if (!res.ok) throw new Error(body?.message ?? `request failed (${res.status})`);
		return body as DraftView;
	}

	function show(next: DraftView) {
		draft = next;
		rememberDraft(avatarId, next.id);
		if (next.outfit && next.outfit !== reported) {
			onMade(next.outfit, reported);
			reported = next.outfit;
		}
	}

	async function run(work: () => Promise<DraftView>) {
		busy = true;
		errorMessage = '';
		try {
			show(await work());
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function start() {
		void run(() =>
			call('/library/race-outfits/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ avatarId, description })
			})
		);
	}

	function act(action: 'retry-european' | 'approve' | 'retry-african') {
		const id = draft?.id;
		if (!id) return;
		void run(() =>
			call(`/library/race-outfits/generate/${id}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action })
			})
		);
	}

	function startOver() {
		if (preview.url) URL.revokeObjectURL(preview.url);
		preview = { key: '', url: '', error: '' };
		draft = null;
		reported = null;
		errorMessage = '';
		rememberDraft(avatarId, null);
	}

	// pick a draft left running for this avatar back up
	$effect(() => {
		const id = rememberedDraft(avatarId);
		if (!id || draft) return;
		void call(`/library/race-outfits/generate/${id}`)
			.then((d) => {
				description = d.description;
				reported = d.outfit;
				draft = d;
			})
			.catch(() => rememberDraft(avatarId, null));
	});

	// while a GPU job or the keyer is busy, check every few seconds
	$effect(() => {
		if (!working || !draft) return;
		const id = draft.id;
		const timer = setInterval(() => {
			call(`/library/race-outfits/generate/${id}`)
				.then((d) => {
					if (draft?.id !== id) return;
					errorMessage = '';
					show(d);
				})
				.catch((e: unknown) => {
					errorMessage = e instanceof Error ? e.message : String(e);
				});
		}, 3000);
		return () => clearInterval(timer);
	});
</script>

<div class="new-outfit">
	<div class="columns">
		<section class="left">
			<button type="button" class="back-link" onclick={onBack}>
				<span aria-hidden="true">←</span> Back to clothes
			</button>

			<label class="studio-label full">
				<span>Outfit</span>
				<textarea
					class="studio-input"
					rows="5"
					placeholder="Just the clothes, e.g. a navy nurse's tunic with white piping and navy trousers"
					bind:value={description}
					disabled={busy || Boolean(draft)}
				></textarea>
			</label>

			{#if stage === 'describe'}
				<p class="hint">Describe only the clothes. The pose, position, framing and bald head are kept for you.</p>
				<div class="actions">
					<button type="button" class="studio-btn" disabled={busy || description.trim().length < 3} onclick={start}>
						Generate
					</button>
				</div>
			{:else if stage === 'first' && draft?.european.status === 'failed'}
				<div class="actions">
					<button type="button" class="studio-btn" disabled={busy} onclick={() => act('retry-european')}>Try again</button>
				</div>
				<button type="button" class="link" disabled={busy} onclick={startOver}>Change the outfit</button>
			{:else if stage === 'check'}
				<p class="hint">Does the outfit look right?</p>
				<div class="actions">
					<button type="button" class="studio-btn" disabled={busy || !preview.url} onclick={() => act('approve')}>
						Looks good
					</button>
					<button type="button" class="studio-btn secondary" disabled={busy} onclick={() => act('retry-european')}>
						Try again
					</button>
				</div>
				<button type="button" class="link" disabled={busy} onclick={startOver}>Change the outfit</button>
			{:else if stage === 'finishing' && draft?.african.status === 'failed'}
				<div class="actions">
					<button type="button" class="studio-btn" disabled={busy} onclick={() => act('retry-african')}>Try again</button>
				</div>
			{:else if stage === 'done' && draft?.outfit}
				{@const outfit = draft.outfit}
				<div class="actions">
					<button type="button" class="studio-btn" disabled={busy || !finished?.ready} onclick={() => onWear(outfit)}>
						Wear this outfit
					</button>
					<button type="button" class="studio-btn secondary" disabled={busy} onclick={() => act('retry-african')}>
						Try again
					</button>
				</div>
				<button type="button" class="link" disabled={busy} onclick={startOver}>Make another outfit</button>
			{/if}
		</section>

		<section class="right" aria-label="Outfit preview">
			<div class="preview-stage">
				{#if shownUrl}
					<img class="preview-image" src={shownUrl} alt="" />
				{:else}
					<div class="preview-placeholder">Preview</div>
				{/if}

				{#if waiting}
					<div class="overlay busy" role="status" aria-live="polite">
						<span class="spinner" aria-hidden="true"></span>
						<span>{waiting}</span>
					</div>
				{/if}

				{#if problem}
					<div class="overlay error" role="alert">
						<strong>Something went wrong</strong>
						<span>{problem}</span>
					</div>
				{/if}
			</div>
		</section>
	</div>
</div>

<style>
	.new-outfit {
		display: grid;
		min-height: 0;
		min-width: 0;
		overflow: auto;
		overscroll-behavior: contain;
	}

	.columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1.25rem;
		align-items: start;
	}

	.left,
	.right {
		display: grid;
		gap: 0.85rem;
		min-width: 0;
	}

	.right {
		align-content: start;
		width: 90%;
		justify-self: center;
	}

	.back-link,
	.link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		width: fit-content;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-muted, #667085);
		font: inherit;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}

	.link {
		text-decoration: underline;
		text-underline-offset: 0.12em;
	}

	.back-link:hover:not(:disabled),
	.link:hover:not(:disabled) {
		color: var(--text, #18181b);
	}

	.back-link:disabled,
	.link:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}







	.hint {
		margin: 0;
		color: var(--text-muted, #667085);
		font-size: 0.8125rem;
		line-height: 1.45;
	}


	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
	}






	.preview-stage {
		position: relative;
		aspect-ratio: 1;
		width: 100%;
		border: 1px solid var(--border, #e5e7eb);
		border-radius: var(--radius-md, 0.5rem);
		background-color: var(--avatar-studio-appearance-paper, #8a8498);
		background-image: var(--avatar-studio-appearance-backdrop);
		overflow: hidden;
	}

	.preview-image,
	.preview-placeholder,
	.overlay {
		position: absolute;
		inset: 0;
	}

	.preview-image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.preview-placeholder {
		display: grid;
		place-items: center;
		color: var(--text-muted, #667085);
		font-size: 0.875rem;
	}

	.overlay {
		display: grid;
		place-content: center;
		gap: 0.5rem;
		padding: 1rem;
		text-align: center;
		background: color-mix(in srgb, var(--bg-elevated, #fff) 78%, transparent);
	}

	.overlay.busy {
		color: var(--text, #18181b);
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.45;
	}

	.overlay.error {
		background: color-mix(in srgb, #fef2f2 88%, transparent);
		color: #991b1b;
		font-size: 0.8125rem;
	}

	.spinner {
		width: 1.5rem;
		height: 1.5rem;
		margin-inline: auto;
		border: 2px solid color-mix(in srgb, var(--accent, #7f56d9) 25%, transparent);
		border-top-color: var(--accent, #7f56d9);
		border-radius: 50%;
		animation: new-outfit-spin 0.8s linear infinite;
	}

	@keyframes new-outfit-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 720px) {
		.columns {
			grid-template-columns: 1fr;
		}

		.right {
			width: 100%;
		}
	}
</style>
