# Licences of the site's fonts

Every font the product site loads is self-hosted under `docs/site/fonts/`; the site makes no request to a font service.

| Font | Files | Used for | Licence | Licence text |
|---|---|---|---|---|
| Geist | `fonts/geist-latin.woff2` (variable, 100 to 900, latin) | every headline, all prose, the island nav and buttons | SIL Open Font License 1.1, Copyright 2024 The Geist Project Authors | [`fonts/Geist-OFL.txt`](fonts/Geist-OFL.txt) |
| Geist Mono | `fonts/geist-mono-latin.woff2` (variable, 100 to 900, latin) | eyebrows, numbers, dates, sources, commands | SIL Open Font License 1.1, the same project and notice | [`fonts/Geist-OFL.txt`](fonts/Geist-OFL.txt) |
| Host Grotesk | `fonts/host-grotesk-latin.woff2` | the text inside the diagram kit's figures on the chapter pages, which are measured to it | SIL Open Font License 1.1 | [`fonts/HostGrotesk-OFL.txt`](fonts/HostGrotesk-OFL.txt) |
| Fragment Mono | `fonts/fragment-mono-latin.woff2` | identifiers inside the diagram kit's figures | SIL Open Font License 1.1 | [`fonts/FragmentMono-OFL.txt`](fonts/FragmentMono-OFL.txt) |

Geist and Geist Mono were fetched on 2026-10-01 from Google Fonts (`fonts.gstatic.com/s/geist/v5`, `/s/geistmono/v6`,
the latin subsets) and their licence from `github.com/vercel/geist-font` (`OFL.txt`). The recordings under
`assets/showcase/` embed the same two faces as data URIs, under the same licence.

`fonts/anybody-latin.woff2` and `fonts/jetbrains-mono-latin.woff2` (with `Anybody-OFL.txt` and `JetBrainsMono-OFL.txt`)
belonged to the previous version of the site and are no longer loaded by any page.
