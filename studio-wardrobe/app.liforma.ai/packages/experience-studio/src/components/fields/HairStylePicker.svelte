<script lang="ts">
	// LOCAL DEV ONLY (2026-10-04, user: "make sure that the color palette appears in every character that is made ... the palette
	// should be laid on the side. So that once a color is chosen, all the hairstyles are converted to that color. And if another
	// hairstyle is chosen after that, it stays in the chosen color"). The one hair picker for the character page and the
	// Experience Studio's character panel: the colour palette down the side, one tile per style. The picker keeps a chosen
	// colour (at first the colour of the hair worn): every tile shows its style in that colour, choosing a style wears it in that
	// colour, and choosing a colour re-colours the hair worn. A style without the five colours (a cap) shows one tile per its own,
	// and the styles that came in blue keep that original look as a tile of its own.
	import AppearanceIdPicker from './AppearanceIdPicker.svelte';
	import {
		BALD_HAIR_ID,
		BALD_HAIR_LABEL,
		appearanceOptionLabel,
		hairOptionUrl,
		isBaldHair
	} from '../../lib/characterAppearance.js';
	import {
		groupHairStyles,
		hairColourOf,
		hairStyleGroupFor,
		hairStyleGroupOf,
		hairTiles,
		hasHouseColours,
		paletteColours,
		recolouredHairId
	} from '../../lib/hairStyles.js';

	type Props = {
		/** the hair offered (already narrowed to the character's ethnicity), bald left out */
		hairIds: readonly string[];
		/** the hair worn now ('' for none, or the bald id) */
		wornId: string;
		avatarId: string;
		cdnBaseUrl: string;
		disabled?: boolean;
		overlayImage?: string;
		overlayFallbackImage?: string;
		overlayPlacement?: 'over' | 'under';
		/** offer the bald tile */
		bald?: boolean;
		/** a tile was chosen */
		onSelect: (id: string) => void;
		/** the palette re-coloured the hair worn (defaults to onSelect) */
		onRecolour?: (id: string) => void;
		onClose?: () => void;
	};

	let {
		hairIds,
		wornId,
		avatarId,
		cdnBaseUrl,
		disabled = false,
		overlayImage = '',
		overlayFallbackImage = '',
		overlayPlacement = 'under',
		bald = true,
		onSelect,
		onRecolour,
		onClose
	}: Props = $props();

	const groups = $derived(groupHairStyles(hairIds.filter((id) => !isBaldHair(id))));
	const palette = $derived(paletteColours(groups));
	let chosen = $state<string>('black');
	// the chosen colour follows the hair worn whenever that is in one of the five (opening on a copper bob shows everything
	// in copper); a cap or bald leaves it where it was
	$effect(() => {
		const worn = hairColourOf(wornId);
		if (worn) chosen = worn;
	});

	const options = $derived.by(() => {
		const tiles = hairTiles(groups, chosen, (style) => appearanceOptionLabel(style));
		const out: { id: string; image: string; name?: string }[] = tiles.map((t) => ({
			id: t.id,
			image: hairOptionUrl(cdnBaseUrl, avatarId, t.id),
			name: t.name
		}));
		// hair worn that is not on offer (another ethnicity's fit, a hidden style) stays visible at the front
		if (wornId && !isBaldHair(wornId) && !hairStyleGroupFor(groups, wornId)) {
			out.unshift({ id: wornId, image: hairOptionUrl(cdnBaseUrl, avatarId, wornId) });
		}
		if (bald) out.push({ id: BALD_HAIR_ID, image: '', name: BALD_HAIR_LABEL });
		return out;
	});
	// the worn style's tile shows as chosen, whatever colour the tiles are in (and for a style's plain original); a worn hair
	// with a tile of its own (a kept original, a cap) is that tile
	const selectedTileId = $derived.by(() => {
		if (options.some((o) => o.id === wornId)) return wornId;
		const group = hairStyleGroupFor(groups, wornId);
		if (!group || !hasHouseColours(group)) return wornId;
		return options.find((o) => hairStyleGroupOf(groups, o.id) === group)?.id ?? wornId;
	});

	function pickColour(colour: string) {
		chosen = colour;
		const next = recolouredHairId(groups, wornId, colour);
		if (next) (onRecolour ?? onSelect)(next);
	}
</script>

<div class="hair-style-picker">
	{#if palette.length}
		<aside class="palette" aria-label="Hair colour">
			<h3>Colour</h3>
			{#each palette as colour (colour.id)}
				<button
					type="button"
					class="colour"
					class:on={colour.id === chosen}
					aria-pressed={colour.id === chosen}
					{disabled}
					onclick={() => pickColour(colour.id)}
				>
					<span class="dot" style:--swatch={colour.swatch} aria-hidden="true"></span>
					<span class="name">{colour.label}</span>
				</button>
			{/each}
		</aside>
	{/if}
	<div class="tiles">
		<AppearanceIdPicker
			label="Hair"
			{options}
			selectedId={selectedTileId}
			{disabled}
			{overlayImage}
			{overlayFallbackImage}
			{overlayPlacement}
			{onSelect}
			{onClose}
		/>
	</div>
</div>

<style>
	.hair-style-picker {
		flex: 1 1 0;
		display: flex;
		gap: 0.85rem;
		min-height: 0;
		min-width: 0;
		height: 100%;
	}

	.palette {
		flex: 0 0 9.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.15rem 0.75rem 0.15rem 0.1rem;
		border-right: 1px solid var(--border-subtle, rgba(127, 127, 127, 0.22));
		overflow-y: auto;
	}

	.palette h3 {
		margin: 0.15rem 0 0.35rem;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		opacity: 0.7;
	}

	.colour {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		border: 1px solid transparent;
		border-radius: 0.6rem;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.88rem;
		text-align: left;
		cursor: pointer;
	}

	.colour:hover:not(:disabled) {
		background: var(--bg-hover, rgba(127, 127, 127, 0.12));
	}

	.colour.on {
		border-color: var(--accent, #7f56d9);
		background: color-mix(in srgb, var(--accent, #7f56d9) 14%, transparent);
	}

	.colour:focus-visible {
		outline: 2px solid var(--accent, #7f56d9);
		outline-offset: 1px;
	}

	.colour:disabled {
		cursor: default;
		opacity: 0.5;
	}

	.dot {
		flex: none;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		background: var(--swatch);
		box-shadow:
			inset 0 0 0 1px rgba(0, 0, 0, 0.35),
			0 0 0 2px rgba(255, 255, 255, 0.16);
	}

	.tiles {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	.tiles > :global(*:not(dialog)) {
		flex: 1 1 0;
		min-height: 0;
	}

	@media (max-width: 640px) {
		.hair-style-picker {
			flex-direction: column;
			gap: 0.6rem;
		}

		.palette {
			flex: none;
			flex-direction: row;
			flex-wrap: wrap;
			padding: 0 0 0.6rem;
			border-right: 0;
			border-bottom: 1px solid var(--border-subtle, rgba(127, 127, 127, 0.22));
			overflow: visible;
		}

		.palette h3 {
			width: 100%;
			margin: 0;
		}

		.colour {
			width: auto;
		}
	}
</style>
