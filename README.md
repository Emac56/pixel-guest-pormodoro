# ⚔ Pixel Quest Pomodoro

A retro pixel-art RPG Pomodoro timer. Pure HTML, CSS and vanilla JavaScript: no frameworks, no build step, no backend.

## Files
- `index.html` - page layout
- `style.css` - pixel-art styling
- `script.js` - timer, rewards, XP/levels, quests, achievements, saving
- `assets/` - optional sprites and sounds (the pixel world is drawn in code, sounds are generated, so nothing is required here)

## Run locally
Open `index.html` in a browser, or serve the folder:

    python -m http.server 8000     # then visit http://localhost:8000

In Termux: `pkg install python`, then run the command above inside the project folder.

## Deploy to GitHub Pages
1. Create a GitHub repository and push these files to the `main` branch (files at the repo root).
2. Repo **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
4. After a minute your game is live at `https://<username>.github.io/<repo-name>/`.

All paths are relative, so it works from the repository subpath.

## How to play
1. Enter a **quest** and set your **reward** (name, minutes, optional description).
2. Press **START**. Your adventurer walks across the world as the timer runs.
3. When focus ends you get XP and coins, a victory screen, and the reward preview.
4. Press **CLAIM REWARD** to start the reward timer (it never starts by itself). **FINISH REWARD EARLY** ends it.
5. A break follows (long break every N sessions). Press START when ready.

Rewards: XP = focus minutes × 2, coins ≈ minutes ÷ 5, only for sessions that run to the end. Level N needs 50·N·(N−1) total XP.

Progress is saved in your browser's localStorage. To start over, clear this site's data.
