# ⚡ QuizBlitz

**Free real-time classroom quiz platform. No subscription needed.**

QuizBlitz is a Kahoot-style quiz app that lets instructors host interactive quizzes while students join and answer from their own devices in real time.

## Features

- **Multiple question types** — Multiple choice, True/False, and Fill-in-the-blank
- **Real-time gameplay** — Firestore-powered live sync between host and players
- **QR code join** — Players scan a QR code or enter a PIN to join
- **Streak & speed scoring** — Points awarded for correctness, speed, and answer streaks
- **Live leaderboard** — Rankings update after every question
- **Image support** — Attach images to questions via ZIP upload
- **Bulk import** — Upload quizzes as JSON files or ZIP archives
- **30+ concurrent players** supported
- **Anonymous auth** — No student accounts required

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JS + Vite |
| Styling | CSS (Montserrat font) |
| Backend | Firebase (Auth, Firestore, Storage, Hosting) |
| Libraries | `qrcode`, `jszip` |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A [Firebase](https://firebase.google.com/) project with Firestore, Auth, and Storage enabled

### Install & Run

```bash
# Clone the repo
git clone https://github.com/neuroZ68/quizblitz.git
cd quizblitz

# Install dependencies
npm install

# Start the dev server
npm run dev
```

### Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/)
2. Enable **Anonymous Authentication**, **Firestore**, and **Storage**
3. Copy your Firebase config into `src/firebaseConfig.js`

### Deploy

```bash
npm run deploy
```

This runs `vite build` and then `firebase deploy`.

## How It Works

1. **Host** opens `/host.html`, creates or uploads a quiz, and starts a game session
2. A **PIN** and **QR code** are displayed for players to join
3. **Players** open `/play.html`, enter the PIN and a nickname
4. The host advances through questions; players answer in real time on their devices
5. After each question, scores and a leaderboard are shown
6. Final results are displayed at the end of the game

## Project Structure

```
├── index.html              # Landing page
├── host.html               # Host interface
├── play.html               # Player interface
├── src/
│   ├── firebase.js         # Firebase service layer
│   ├── firebaseConfig.js   # Firebase project credentials
│   ├── host/hostApp.js     # Host app logic (quiz CRUD, game sessions)
│   ├── player/playerApp.js # Player app logic (join, answer, score)
│   ├── shared/
│   │   ├── leaderboard.js  # Leaderboard rendering
│   │   ├── qrcode.js       # QR code generation
│   │   ├── scoring.js      # Score calculation
│   │   └── timer.js        # Countdown timer
│   └── styles/index.css    # All styles
├── firebase.json           # Firebase hosting & rules config
├── firestore.rules         # Firestore security rules
└── storage.rules           # Storage security rules
```

## Creating Quizzes

See [QUIZ_UPLOAD_GUIDE.md](QUIZ_UPLOAD_GUIDE.md) for detailed instructions on creating and uploading quizzes via JSON or ZIP.

## License

MIT
