# Mempire 3D object kit

Single glossy objects with a tiny face, used for the lobby hero, feature cards, empty states, the leaderboard and the
referee receipt. The fighter characters keep their own v3 character art; this kit is for the game's objects.

- **Material:** glossy candy enamel: hard, wet-look lacquer over soft rounded toy shapes, thick bevels, a bright
  specular streak on each curve, faint subsurface glow at thin edges. No metal chrome, no brushed silver, no glitter.
- **Palette:** main sky blue `#4cc3ff`, accent gold `#ffb800`, rim light royal purple `#7a3cff`, ink `#2a1d5c` for the
  face and fine lines. Grass green `#3fd25f` only on the price-up token (buff); the app's nerf red `#ff4b5c` only on
  the price-down token (nerf). These are the app's own meaning colours (tokens.css).
- **Face:** Mempire's mark: two small round ink dots (`#2a1d5c`) with one white catchlight each, set wide apart, and a
  small lopsided confident smirk; no eyebrows, no pill eyes, no cheeks. On objects where a face fits (coin, crown, chest,
  tower, shield, cloud, tokens); the card hand, trophy and seal carry none.
- **Background:** transparent (no ground shadow) for every object, so each sits on the sky-blue or white surfaces.
- **Subjects:** crown (hero), fighter coin with the face, fanned card hand, tower, treasure chest, trophy
  (leaderboard), sealed referee scroll with a wax seal (receipts), shield (houses), a sleepy cloud (empty states),
  price-up token (buff), price-down token (nerf), crossed swords (battle).

Style line used in every prompt:

> Glossy candy enamel 3D render in sky blue #4cc3ff with gold #ffb800 details and a soft royal purple #7a3cff rim
> light, soft studio lighting, crisp reflections, rounded bevelled edges, gentle toy-like proportions, centred,
> transparent background (no background, no ground shadow), square 1024x1024, no text, no letters, no logos.

Files: `packages/web/public/art/3d/mp-3d-<subject>.webp` (640 px wide, transparent). 3D art generated with ChatGPT.
