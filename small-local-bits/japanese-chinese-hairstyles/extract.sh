#!/bin/zsh
# 2026-10-23 user: "extract them all" - the 14 GPT low renders (women/, men/) through hair_layer_models.py --methods
# hair_matte-anything+birefnet (women --head anna, men --head m-e05b0001), as the 21 Oct curls and route B. Skips any already made.
A=/Users/saizalpreetkaur./Desktop/Liforma_LTD/hair_work/new_styles/blue_test/gpt_low/asian_2026-10-23
cd /Users/saizalpreetkaur./Desktop/Liforma_LTD/Liforma/liforma/tools/image-to-image/scripts
typeset -A NAME HEAD
NAME=(W01_JAPANESE_UPDO japanese-updo W01B_JAPANESE_UPDO_ORNAMENT japanese-updo-ornament W02_CHINESE_HAIRPIN_UPDO chinese-hairpin-updo
  W03_DOUBLE_BUNS double-buns M01_SAMURAI_TOPKNOT samurai-topknot M02_CHINESE_TOPKNOT chinese-topknot M03_TWO_BLOCK_CUT two-block-cut)
HEAD=(women anna men m-e05b0001)
for g in women men; do
  for r in $A/$g/gpt_ASIA_*_t[12].png; do
    b=${r:t:r}; k=${${b#gpt_ASIA_}%_t[12]}; t=${b##*_t}; n=$NAME[$k].gpt$t
    [ -f "$A/cutouts/${n}__hair_matte-anything+birefnet.png" ] && { echo "$n: already done"; continue; }
    echo "== $n"
    /Users/saizalpreetkaur./Desktop/Liforma_LTD/ComfyUI/.venv/bin/python hair_layer_models.py --render "$r" --out-dir $A/cutouts --name $n --methods hair_matte-anything+birefnet --head $HEAD[$g] 2>&1 | grep "checks\|solid-ish\|Error\|error" | tail -3
  done
done
echo EXTRACT_DONE
