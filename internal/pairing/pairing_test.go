package pairing

import (
	"testing"
	"time"
)

func resetForTest(t *testing.T) {
	t.Helper()
	mu.Lock()
	current = state{}
	mu.Unlock()
}

func TestIssueProducesSixDigits(t *testing.T) {
	resetForTest(t)
	code, exp, err := Issue()
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if len(code) != codeDigits {
		t.Fatalf("len=%d want %d (code=%q)", len(code), codeDigits, code)
	}
	for _, r := range code {
		if r < '0' || r > '9' {
			t.Fatalf("non-digit %q in code %q", r, code)
		}
	}
	if d := time.Until(exp); d <= 0 || d > codeTTL+time.Second {
		t.Fatalf("expires=%v out of window", d)
	}
}

func TestVerifyAndConsume(t *testing.T) {
	resetForTest(t)
	code, _, err := Issue()
	if err != nil {
		t.Fatal(err)
	}
	ok, locked := VerifyAttempt(code)
	if !ok || locked {
		t.Fatalf("VerifyAttempt(correct) = (%v,%v), want (true,false)", ok, locked)
	}
	wrong := "000001"
	if wrong == code {
		wrong = "000002"
	}
	if ok, _ := VerifyAttempt(wrong); ok {
		t.Fatal("VerifyAttempt accepted a wrong code")
	}
	Consume()
	if ok, _ := VerifyAttempt(code); ok {
		t.Fatal("VerifyAttempt accepted a consumed code")
	}
	if Active() {
		t.Fatal("Active() true after Consume()")
	}
}

func TestExpiryInvalidatesCode(t *testing.T) {
	resetForTest(t)
	code, _, err := Issue()
	if err != nil {
		t.Fatal(err)
	}
	// Force expiry without sleeping the full TTL.
	mu.Lock()
	current.expires = time.Now().Add(-time.Second)
	mu.Unlock()
	if ok, _ := VerifyAttempt(code); ok {
		t.Fatal("VerifyAttempt accepted an expired code")
	}
	if Active() {
		t.Fatal("Active() true for expired code")
	}
}

func TestIssueReplacesPrevious(t *testing.T) {
	resetForTest(t)
	old, _, err := Issue()
	if err != nil {
		t.Fatal(err)
	}
	fresh, _, err := Issue()
	if err != nil {
		t.Fatal(err)
	}
	if old == fresh {
		// Extremely unlikely (1 in 1e6) but flag it; rerun if hit.
		t.Skip("issued same code twice - rerun")
	}
	if ok, _ := VerifyAttempt(old); ok {
		t.Fatal("VerifyAttempt accepted the replaced code")
	}
	if ok, _ := VerifyAttempt(fresh); !ok {
		t.Fatal("VerifyAttempt rejected the current code")
	}
}

func TestVerifyAttemptLocksAfterFive(t *testing.T) {
	resetForTest(t)
	code, _, err := Issue()
	if err != nil {
		t.Fatal(err)
	}
	wrong := "000001"
	if wrong == code {
		wrong = "000002"
	}
	for i := 1; i <= maxFailures-1; i++ {
		ok, locked := VerifyAttempt(wrong)
		if ok || locked {
			t.Fatalf("attempt %d: got (%v,%v), want (false,false)", i, ok, locked)
		}
	}
	ok, locked := VerifyAttempt(wrong)
	if ok || !locked {
		t.Fatalf("attempt %d: got (%v,%v), want (false,true)", maxFailures, ok, locked)
	}
	if Active() {
		t.Fatal("Active() true after lockout - code should be consumed")
	}
	// Further attempts with the right code now fail (code is gone).
	if ok, _ := VerifyAttempt(code); ok {
		t.Fatal("VerifyAttempt accepted a code after lockout consumed it")
	}
}

func TestVerifyAttemptSuccessResetsCounter(t *testing.T) {
	resetForTest(t)
	code, _, err := Issue()
	if err != nil {
		t.Fatal(err)
	}
	wrong := "000001"
	if wrong == code {
		wrong = "000002"
	}
	for i := 0; i < maxFailures-1; i++ {
		VerifyAttempt(wrong)
	}
	if ok, locked := VerifyAttempt(code); !ok || locked {
		t.Fatalf("correct code after 4 misses: got (%v,%v), want (true,false)", ok, locked)
	}
	mu.Lock()
	failed := len(current.failures)
	mu.Unlock()
	if failed != 0 {
		t.Fatalf("failure counter not reset after success: %d entries", failed)
	}
}

func TestVerifyAttemptWindowSlides(t *testing.T) {
	resetForTest(t)
	code, _, err := Issue()
	if err != nil {
		t.Fatal(err)
	}
	wrong := "000001"
	if wrong == code {
		wrong = "000002"
	}
	// Plant 4 failures dated outside the sliding window - they should be
	// dropped before counting, so the next miss is treated as #1, not #5.
	old := time.Now().Add(-2 * failureWindow)
	mu.Lock()
	current.failures = []time.Time{old, old, old, old}
	mu.Unlock()
	ok, locked := VerifyAttempt(wrong)
	if ok || locked {
		t.Fatalf("stale failures should not count: got (%v,%v), want (false,false)", ok, locked)
	}
	mu.Lock()
	failed := len(current.failures)
	mu.Unlock()
	if failed != 1 {
		t.Fatalf("expected 1 fresh failure after pruning, got %d", failed)
	}
}
