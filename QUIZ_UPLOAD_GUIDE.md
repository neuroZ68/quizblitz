# QuizBlitz — Bulk Quiz Upload Guide

Upload 10, 50, or 100+ questions at once using a `.json` or `.zip` file.

## Quick Start

1. Go to **Host Dashboard** → click **📤 Import Quiz**
2. Enter a quiz title
3. Drop your `.json` or `.zip` file
4. Click **Import Questions**

---

## Option 1: JSON File (Text Only)

Create a `.json` file containing an array of question objects.

### Question Types

| Type | `type` value | Required Fields |
|------|-------------|-----------------|
| Multiple Choice | `"mc"` | `text`, `options` (2–4), `correctAnswer` |
| True/False | `"tf"` | `text`, `correctAnswer` (`"True"` or `"False"`) |
| Fill in the Blank | `"blank"` | `text`, `correctAnswer` |

### Example: `questions.json`

```json
[
  {
    "type": "mc",
    "text": "What is the capital of France?",
    "options": ["London", "Paris", "Berlin", "Madrid"],
    "correctAnswer": "Paris",
    "timeLimit": 20
  },
  {
    "type": "mc",
    "text": "Which planet is closest to the Sun?",
    "options": ["Venus", "Earth", "Mercury", "Mars"],
    "correctAnswer": "Mercury",
    "timeLimit": 15
  },
  {
    "type": "tf",
    "text": "The Great Wall of China is visible from space.",
    "correctAnswer": "False",
    "timeLimit": 10
  },
  {
    "type": "blank",
    "text": "Water freezes at ___ degrees Celsius.",
    "correctAnswer": "0",
    "acceptedAnswers": ["0", "zero", "Zero"],
    "timeLimit": 15
  }
]
```

### Field Reference

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `type` | ✅ | — | `"mc"`, `"tf"`, or `"blank"` |
| `text` | ✅ | — | The question text |
| `options` | MC only | — | Array of 2–4 answer strings |
| `correctAnswer` | ✅ | — | Must exactly match one of the options (MC/TF) or be the primary answer (blank) |
| `acceptedAnswers` | ❌ | `[correctAnswer]` | Array of all accepted answers for blank questions |
| `timeLimit` | ❌ | `20` | Seconds allowed to answer |
| `imageUrl` | ❌ | `null` | Direct URL to an image |

---

## Option 2: ZIP File (With Images)

To include images with your questions, create a `.zip` file containing:

```
my_quiz.zip
├── questions.json
├── solar_system.png
├── cell_diagram.jpg
├── flag_france.webp
└── ... (any image files)
```

### How It Works

1. In `questions.json`, use the `"image"` field with the **exact filename**
2. During import, each image is uploaded to cloud storage
3. The image URL is automatically attached to the question

### Example: `questions.json` (inside the zip)

```json
[
  {
    "type": "mc",
    "text": "Identify this planet:",
    "image": "solar_system.png",
    "options": ["Jupiter", "Saturn", "Neptune", "Uranus"],
    "correctAnswer": "Saturn",
    "timeLimit": 20
  },
  {
    "type": "mc",
    "text": "What country does this flag belong to?",
    "image": "flag_france.webp",
    "options": ["Italy", "France", "Belgium", "Ireland"],
    "correctAnswer": "France",
    "timeLimit": 15
  },
  {
    "type": "tf",
    "text": "This is a plant cell.",
    "image": "cell_diagram.jpg",
    "correctAnswer": "True",
    "timeLimit": 20
  },
  {
    "type": "blank",
    "text": "The element shown has atomic number ___.",
    "correctAnswer": "6",
    "acceptedAnswers": ["6", "six", "Six"],
    "timeLimit": 30
  }
]
```

### Supported Image Formats

`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp`

Max size per image: **5 MB**

### Tips

- Image filenames are **case-insensitive** (`Photo.PNG` matches `photo.png`)
- Images can be in subfolders inside the zip — they're matched by filename
- Questions without the `"image"` field simply won't have an image
- You can mix image and non-image questions in the same file
- A progress bar shows upload status during import

---

## Common Mistakes

| Problem | Fix |
|---------|-----|
| `correctAnswer` doesn't match any option | Must be an **exact string match** (e.g., `"Paris"` not `"paris"`) |
| MC question with < 2 options | Multiple choice needs at least 2 options |
| Missing `type` field | Every question needs `"mc"`, `"tf"`, or `"blank"` |
| ZIP has no `questions.json` | The JSON file inside the zip **must** be named `questions.json` |
| Image not showing | Check that the `"image"` filename matches the file in the zip exactly |

---

## Template Files

Copy these starter templates to get going quickly.

### Minimal 5-Question Template

```json
[
  { "type": "mc", "text": "Q1?", "options": ["A", "B", "C", "D"], "correctAnswer": "A" },
  { "type": "mc", "text": "Q2?", "options": ["A", "B", "C", "D"], "correctAnswer": "B" },
  { "type": "tf", "text": "Q3 statement.", "correctAnswer": "True" },
  { "type": "tf", "text": "Q4 statement.", "correctAnswer": "False" },
  { "type": "blank", "text": "Q5 fill in ___.", "correctAnswer": "answer", "acceptedAnswers": ["answer", "Answer"] }
]
```
