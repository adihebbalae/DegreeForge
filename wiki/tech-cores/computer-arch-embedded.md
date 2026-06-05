---
title: Computer Architecture & Embedded Systems — Tech Core
tags: [tech-core]
source_count: 2
updated: 2026-04-15
---

# Computer Architecture & Embedded Systems

**Adi's declared tech core** (status: intended). CE category. Graduate track: Architecture, Computer Systems, & Embedded Systems (ACSES).

---

## Required Courses

| Role | Course | Title | Offered |
|---|---|---|---|
| Advanced Math | M 325K | Discrete Mathematics (3 hr) | Fall + Spring |
| Core 1 | ECE 316 | Digital Logic Design (3 hr) | Fall + Spring |
| Core 2 | ECE 460N | Computer Architecture (3 hr) | Fall + Spring |
| Core Lab | ECE 445L | Embedded Systems Design Laboratory (4 hr) | Fall + Spring |
| Required Elective | ECE 360C | Algorithms (3 hr) | Fall + Spring |
| Tech Electives (3) | see pool below | — | varies |

**Total credits (required)**: 3+3+3+4+3 = 16 hrs + 3 tech electives (~9-12 hr) = **~25-28 hrs for full tech core**

---

## Tech Elective Pool (choose 3 of 17)

| Course | Title | Category |
|---|---|---|
| ECE 360G | Graph Theory | algorithms/theory |
| ECE 360P | Concurrent Programming | systems |
| ECE 361C | Networking | networking |
| ECE 361E | Autonomous Vehicles | applied/systems |
| ECE 361G | ??? | — |
| ECE 361N | ??? | — |
| ECE 362K | Introduction to Automatic Control | control |
| ECE 372N | Telecommunication Networks | networking |
| ECE 379K | Applied Machine Learning | ML/AI |
| ECE 422C | Software Design & Implementation II | software |
| ECE 445M | Embedded Systems Senior Design | embedded |
| ECE 445S | Real-Time Digital Signal Processing Lab | DSP lab |
| ECE 460J | Data Science Laboratory | data |
| ECE 460M | ??? | — |
| ECE 460R | ??? | — |
| ECE 461S | ??? | — |
| ECE 461T | ??? | — |

> 🔍 **VERIFY**: Several elective titles are unknown (marked ???). Cross-reference with `data/course-catalog.json` to fill gaps.

---

## Adi's Status

| Course | Status | Notes |
|---|---|---|
| M 325K | 🔄 In progress (Spring 2026) | — |
| ECE 316 | ❌ Remaining | Prereq: ECE 406 ✅ |
| ECE 460N | ❌ Remaining | Prereq: ECE 316 |
| ECE 445L | ❌ Remaining | Prereq: ECE 419K + ECE 316 |
| ECE 360C | ❌ Remaining | Prereq: ECE 312, M 340L |
| Tech electives (3) | ❌ Remaining | Must pick 3 from pool above |

**Critical path**: ECE 406 → ECE 316 → ECE 460N → (ECE 445L requires ECE 419K + ECE 316)

---

## Prerequisite Chain for This Track

```
M 408C ─→ ECE 406 (done: A-) ─→ ECE 316 ─→ ECE 460N
                           └─→ ECE 319K/419K (done: in progress) ─→ ECE 445L
ECE 312 (in progress) ─→ ECE 360C
M 340L (done: M 411) ─→ ECE 360C
M 325K (in progress) ─→ tech core math requirement ✓
```

ECE 316 is the **first priority** — it unlocks ECE 460N (core 2) and is needed for ECE 445L.

---

## Recommended Sequencing

Assuming 17-18 hr/semester target and graduation Spring 2029:

| Semester | Key courses for this track |
|---|---|
| Fall 2026 | ECE 316 (unlocks rest), ECE 360C |
| Spring 2027 | ECE 460N, tech elective 1 |
| Fall 2027 | ECE 445L, tech elective 2 |
| Spring 2028 | tech elective 3, advanced tech elective |

> 🔍 **VERIFY**: Check offering schedule for ECE 316, ECE 460N, ECE 445L, ECE 360C — all listed as Fall+Spring but confirm in `data/offering-schedule.json`.

---

## Cross-references

- All tech core tracks: [[degree-reqs/tech-cores]]
- Student profile: [[user/student-profile]]
- Offering patterns: [[scheduling/offering-guide]]
