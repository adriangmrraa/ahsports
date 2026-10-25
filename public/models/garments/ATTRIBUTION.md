# ATTRIBUTION — GLB candidates

Every file in this folder (old `pp-`/`check-` round + new `sena`/`mh-` round).
Validation stats measured locally by `research/scripts/validate-glb.js` (GLB header + JSON chunk parse).
`uv` = mesh has TEXCOORD_0. `dims` = position bbox extents (width;height;depth) in file-native units.

## New this round — SENA kit (folder + repack)

| File | Title | Author | License | Source | Stats |
|---|---|---|---|---|---|
| `sena-kit/soccer_kit.gltf` + `soccer_kit.bin` + 19 texture files | Free Soccer Kit (jersey+shorts) | Alberto Parra — SENA studio (Granada, ES) | **No explicit license stated** — free public download | https://senastudio.art/free-soccer-kit → Google Drive `drive.google.com/open?id=1dKk4YR9MRHzwWO5UMrgOF-iOK6Gyg6xl` | 17 meshes, ~444k tris total, all TEXCOORD_0, Draco-compressed (`KHR_draco_mesh_compression` required) |
| `sena-kit.glb` | same, repacked to single GLB | same | same | local repack via `@gltf-transform/cli` (Draco decoded, textures resized ≤2048px) — `extensionsRequired: none` | 18.4 MB, 17 meshes, UV ✓ normals ✓ |

SENA kit mesh map (from accessor min/max; figure-space meters, ~1.6 m tall):
- `42` (46k tris, y 0.94–1.60) + `38`/`62` (8k tris each, sleeves) + `9` (50k tris, y 0.92–1.61) = **jersey body + sleeves + inner layer**
- `Pattern2D_1871022/23/24/25` + `Pattern2D_1871413/14/15/16` (y 0.65–1.06) = **shorts panels** (front/back L/R + waistband)
- `Pattern2D_3805002` (y 1.51–1.61) = collar, `Pattern_2702362` = small trim, `Pattern2D_2114669` = drawstring/tab
- No socks/cleats in the glTF export (they exist only in `soccer_kit.blend` — same Drive folder, file id `1zisKtdaC7a5SomKCVhW6FVhYYxUy-Wls`)
- Missing-from-Drive texture `1002-soccer_diffuse_1002.png` was filled locally with a copy of `soccer_diffuse_1002.png` (flagged — verify visually).

## New this round — MakeHuman Community asset packs

Assets extracted from official packs, OBJ→GLB via `obj2gltf` (UVs preserved; no vertex normals in source OBJ — generate in pipeline). All designed to fit the MakeHuman base body (~dm scale, arms out).
Diffuser PNG copied alongside each GLB as `*-diffuse.png` for reference.

| File | Asset | Author | License | Source |
|---|---|---|---|---|
| `shorts-mh-elvs-swim.glb` | elvs_male_swim_shorts1 | Elvaerwyn | CC-BY | pack `pants03` (https://static.makehumancommunity.org/assets/assetpacks/pants03.html), asset page makehumancommunity.org/node/1321 |
| `shorts-mh-elvs-trouser.glb` | elvs_male_trouser_short_1 | Elvaerwyn | CC-BY | pack `pants03`, node/1801 |
| `pants-mh-cortu-cargo.glb` | cortu_cargo_pants | Cortu | CC0 | pack `pants01` (…/assetpacks/pants01.html), node/2798 |
| `pants-mh-toigo-wool.glb` | toigo_wool_pants | MargaretToigo | CC0 | pack `pants01`, node/1194 |
| `jersey-mh-namuhekam-polo.glb` | namuhekam_male_polo_shirt | namuhekam | CC0 | pack `shirts01` (…/assetpacks/shirts01.html), node/2909 |
| `jersey-mh-toigo-tucked-tee.glb` | toigo_basic_tucked_t-shirt | MargaretToigo | CC0 | pack `shirts01` |
| `longsleeve-mh-toigo-sweater.glb` | toigo_fisherman_sweater | MargaretToigo | CC0 | pack `shirts01`, node/1187 |
| `longsleeve-mh-elvs-shirt.glb` | elvs_male_shirt_untucked_bd1 | Elvaerwyn | CC-BY | pack `shirts02` (…/assetpacks/shirts02.html), node/1800 |
| `hoodie-mh-elvs-sweatjacket.glb` | elvs_hooded_sweat_jacket1 | Elvaerwyn | CC-BY | pack `shirts02`, node/1450 |

Pack zips: `https://files.makehumancommunity.org/asset_packs/<pack>/<pack>_<cc0|ccby>.zip`. Pack manifests (`packs/<pack>.json` inside each zip) carry per-asset author+license.

## New this round — Poly.pizza additions

| File | Title | Author | License | Source | Stats |
|---|---|---|---|---|---|
| `shorts-pp-drawers-21k.glb` | Drawers | CMHT Oculus | CC-BY 3.0 | https://poly.pizza/m/cdne0uL-l_0 | 21,872 tris, uv ✓, dims 29.7;48.0;9.6 (bloomers standing — usable silhouette, heavy) |
| `shorts-pp-drawers-5k.glb` | Drawers | CMHT Oculus | CC-BY 3.0 | https://poly.pizza/m/8a1t4C7F5_q | 5,884 tris, uv ✓, dims 42.5;1.0;31.0 — FLAT-FOLDED, reject |
| `pants-pp-wrangler-jeans.glb` | Mom's Wrangler | Anonymous | CC-BY 3.0 | https://poly.pizza/m/dWwNyqBmMvU | 13,498 tris, **uv ✗ normals ✗**, dims 0.65;0.44;1.48 (lying flat) — reject for design mapping, keep as shape-only fallback |
| `jersey-pp-timehotel-tshirt.glb` | Time Hotel 5.08 (White TShirt) | S. Paul Michael | CC-BY 3.0 | https://poly.pizza/m/2TR6v2bHuk2 | 41,872 tris, uv ✓, dims 0.43;0.15;0.49 — FOLDED shirt prop, reject |

## Prior round files — attribution recovered

| File | Title | Author | License | Source | Notes |
|---|---|---|---|---|---|
| `accessory-pp-don-backpack-flashlight.glb` | Backpack & Flashlight | Don Carson | CC-BY 3.0 | https://poly.pizza/m/aVCjXvxs6sP | 2,818 tris, uv ✓ (212,024 B exact-match verified) |
| `accessory-pp-duffel.glb` | Duffel Bag | accidentallyc | CC0 1.0 | https://poly.pizza/m/rysPhwuIP4 | 1,376 tris, uv ✓ (94,416 B verified) |
| `accessory-pp-emmett-backpack.glb` | Backpack | Emmett "TawpShelf" Baber | CC-BY 3.0 | https://poly.pizza/m/ems9KHrB_4x | 714 tris, uv ✓ — remote file re-encoded upstream (66,972 B now vs 65,736 local); same model |
| `hoodie-pp-ben-jumper.glb` | Jumper | Ben London | CC-BY 3.0 | https://poly.pizza/m/dYvRq2e23VF | 15,874 tris, 39 meshes, dims 0.93;0.76;0.83 |
| `hoodie-pp-polygonal-jacket.glb` | Jacket | Polygonal Mind | CC0 1.0 | https://poly.pizza/m/eeKk3ObCbf | 592 tris, uv ✓ — scale ~mm (dims 0.005;0.009;0.018 → rescale ×100) |
| `jersey-pp-nour-tshirt.glb` | T Shirt | Nour | CC-BY 3.0 | https://poly.pizza/m/oZOt671DyI | 5,312 tris, uv ✓, dims 0.76;0.35;0.17 — **lying flat / wide-short**; weak jersey pick |
| `sleeveless-pp-zayn-tank.glb` | Tank | Zayn | CC-BY 3.0 | https://poly.pizza/m/YWSyTmvGI2 | **MILITARY TANK** (node `Tank_Cube.013`, 3.8×2.6×6.5). Mislabeled in prior round — reject |
| `sleeveless-pp-pabloluna-tank.glb` | Tank | PabloLuna57 | CC-BY 3.0 | https://poly.pizza/m/CAZeAFrhC7 | **MILITARY TANK**, md5-identical to `check-kolos-tank.glb` (same mesh re-uploaded by two authors) |
| `check-kolos-tank.glb` | Tank | KolosStudios | CC-BY 3.0 | https://poly.pizza/m/egcLMSGiuA | **MILITARY TANK** (760 tris, no UV, 12.6 cm). Reject |
| `check-undefined-tank.glb` | unknown — 43 `group*` meshes, 0.76×0.35×1.05 | unidentified | unidentified | source not recovered (probably Sketchfab-style export; no size match on Poly.pizza) | Reject |

## Flagged for MANUAL download (Sketchfab, all verified downloadable + CC-BY; `api.sketchfab.com/v3/models/<uid>/download` → 401 anonymous)

| Model | Author | License | URL |
|---|---|---|---|
| Soccer Shorts | zeryshahid | CC Attribution | https://sketchfab.com/3d-models/soccer-shorts-0262f47e736e430f94c3588599a15a31 |
| Modern pants (joggers) | DanlyVostok | CC Attribution | https://sketchfab.com/3d-models/modern-pants-joggers-8f5d9d46bd514bcdbe3796225b838a52 |
| Dillard, Darren Joggers | darrendillard1 | CC Attribution | https://sketchfab.com/3d-models/dillard-darren-joggers-1f6f7318f9364456b8d58c1eaf71762b |
| Dickies Long Sleeve Shirt | Kodie Russell | CC Attribution | https://sketchfab.com/3d-models/dickies-long-sleeve-shirt-f6f27327fbaf423081ae9da8e5dc109e |
| Hendrick Kganyago Soccer Uniform (jersey+shorts kit) | hendrickkganyago | CC Attribution | https://sketchfab.com/3d-models/hendrick-kganyago-soccer-uniform-f3a43f4c50d94074b53d7344a6610315 |
| Children Kit | zeryshahid | CC Attribution | https://sketchfab.com/3d-models/children-kit-717426efef2245d7994e5d5342fc24db |
| Hangers and Long Sleeve Shirt | dudecon | CC Attribution | https://sketchfab.com/3d-models/hangers-and-long-sleeve-shirt-14cc81980a06473a820f811596418fae |
| Shirt (Scott Alt 2) — Character Clothes (Free) | CT Reed | CC Attribution | https://sketchfab.com/3d-models/shirt-scott-alt-2-character-clothes-free-80e8c3ff182240518f5b9dd34bc541bc |
