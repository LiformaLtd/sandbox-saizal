// LOCAL DEV ONLY (2026-10-02, user: "We don't need the elf ear and the long blonde style to be used anywhere"): hairstyles no
// hair picker offers any more, in any colour or race fit (`<style>[-<colour>][--<race>]`). Characters already wearing one keep
// it; the layers stay on the CDN relay, only the pickers skip them. Used by the character page (raceHair.ts) and the
// Experience Studio character panel.

export const HIDDEN_HAIR_STYLES: readonly string[] = ['long-blonde-elf_princess', 'long-blonde.1'];

/** Whether a hair id is one of the hidden styles, in any colour or race fit. */
export function isHiddenHairStyle(id: string): boolean {
	const at = id.indexOf('--');
	const hair = at < 0 ? id : id.slice(0, at);
	return HIDDEN_HAIR_STYLES.some((style) => hair === style || hair.startsWith(`${style}-`));
}
