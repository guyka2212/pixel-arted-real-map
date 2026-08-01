# pixel-arted-real-map

A real-world map rendered as **pixel art**, running in the browser. It uses your
device location (via the Geolocation API) to show where you are with a retro
pixel pin.

## Live site

The project is hosted on GitHub Pages:

**https://guyka2212.github.io/pixel-arted-real-map/**

> GitHub Pages is a one-time manual step (the API token used in Codespaces
> can't change repo settings). To enable it:
> **Repo → Settings → Pages → Source: "Deploy from a branch" → main / (root) → Save.**
> The site goes live within a minute or two.

## How it works

- Real map tiles are loaded from [OpenStreetMap](https://www.openstreetmap.org/).
- Each tile is downsampled into a chunky low-resolution grid, posterized to
  fewer colors, then scaled back up with crisp edges — giving the whole world a
  retro video-game look.
- The **LOCATE** button asks the browser for your position and flies to it.
- Click anywhere on the map to drop a marker manually (useful if geolocation is
  blocked).
- The **PIXEL** button opens the "pixel engine" — tweak pixel size, color depth
  and scanlines in real time.

## Files

| File        | Purpose                                    |
|-------------|--------------------------------------------|
| `index.html`| Page structure, HUD, settings, splash      |
| `style.css` | Pixel-art theme, scanlines, marker, popups |
| `script.js` | Pixel tile renderer, geolocation, settings |

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
```

> Note: the Geolocation API needs a secure context (HTTPS) or `localhost`.
> On GitHub Pages it works out of the box.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
