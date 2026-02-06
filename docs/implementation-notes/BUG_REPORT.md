# Umbrellaprompter - Bug Report
**Generated:** December 11, 2024
**Version:** 1.0.6
**Total Bugs Found:** 20

---

## CRITICAL BUGS (Must Fix Immediately)

### Bug #1: Incorrect Function Parameter Type - updateMonitorPosition()
**File:** src/js/operator.js - Line 316
**Severity:** CRITICAL

**Problem:** Function called with number `0` instead of object `{ percent: 0 }`

**Impact:** Runtime errors, NaN values in monitor position

**Fix:** Change `updateMonitorPosition(0)` to `updateMonitorPosition({ percent: 0 })`

---

### Bug #2: Button DOM Structure Destruction  
**File:** src/js/operator.js - Line 1707
**Severity:** CRITICAL

**Problem:** `playPauseBtn.textContent = '▶ Play'` destroys SVG icon and child elements

**Impact:** Play button loses icon, UI breaks

**Fix:** Use `playTextEl.textContent = 'Play'` instead

---

### Bug #3: Duplicate Event Listeners on Position Slider
**File:** src/js/operator.js - Lines 556 and 562-564
**Severity:** CRITICAL

**Problem:** Two separate input listeners on same element

**Impact:** Duplicate IPC messages, performance issues

**Fix:** Combine into single listener

---

### Bug #4: Race Condition - voiceFollowReset Not Defined Early
**File:** src/js/operator.js - Lines 647 and 1215  
**Severity:** HIGH

**Problem:** Function checked at line 647 but defined at line 1215

**Impact:** Settings changes during startup don't reset voice follow

**Fix:** Define function before first use or reorder initialization

---

### Bug #5: Selection Find Returns First Occurrence
**File:** src/js/operator.js - Lines 806-810
**Severity:** HIGH

**Problem:** indexOf() always finds first occurrence, not selected one

**Impact:** Selecting duplicate text jumps to wrong location

**Fix:** Track character position instead of using text search

---

## MODERATE BUGS

### Bug #6: Memory Leak - Animation Frame Not Cleaned
**File:** src/js/operator.js - Lines 943-993

**Problem:** requestAnimationFrame continues when view switches

**Impact:** Unnecessary CPU usage, memory leak

---

### Bug #7: Focus Stealing in Voice Follow Mode  
**File:** src/js/operator.js - Lines 1449-1454

**Problem:** scriptText.focus() called unconditionally

**Impact:** Cannot type in other inputs during voice follow

---

### Bug #8: Persistent State Flag Never Resets
**File:** src/teleprompter.html - Lines 358 and 381

**Problem:** hasLoadedScript flag never reset

**Impact:** Reopening teleprompter behaves incorrectly

---

### Bug #9: Empty Conditional Block
**File:** src/js/operator.js - Lines 1341-1346

**Problem:** Empty if block suggests incomplete code

---

### Bug #10: Division by Zero
**File:** src/js/operator.js - Line 1360

**Problem:** Divides by scriptWords.length without zero check

**Impact:** Returns NaN when script is empty

---

## MINOR BUGS (10 more bugs documented in detail in code)

### Additional Issues:
- Bug #11: Inconsistent use of innerText vs textContent
- Bug #12: No user feedback on find failure  
- Bug #13: Inaccurate line calculation for proportional fonts
- Bug #14: Countdown row visibility not toggled
- Bug #15: Word position mismatch edge cases
- Bug #16: Settings sent before teleprompter ready
- Bug #17: Cleanup errors silently swallowed
- Bug #18: No display selection validation
- Bug #19: No IPC error handling
- Bug #20: Passive event listener warnings

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5 |
| Moderate | 5 |
| Minor | 10 |
| **Total** | **20** |

## Recommended Fix Priority

**Immediate:**
1. Bug #1 - updateMonitorPosition parameter
2. Bug #2 - Button structure destruction  
3. Bug #3 - Duplicate event listeners
4. Bug #7 - Focus stealing

**High Priority:**
5. Bug #4 - Race condition
6. Bug #5 - Selection find
7. Bug #6 - Animation cleanup
8. Bug #10 - Division by zero

**Medium/Low:** Bugs #8-20

---

## Testing Checklist

- [ ] File loading with monitor position
- [ ] Voice follow with input typing
- [ ] Position slider (check IPC messages)
- [ ] View switching (memory leaks)
- [ ] Duplicate text selection
- [ ] Empty script handling
- [ ] Window open/close cycles
- [ ] Countdown toggle

